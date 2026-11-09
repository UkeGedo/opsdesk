import { auditRoutes } from './modules/audit/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { UserService } from './modules/identity/service.js';
import { CustomerService } from './modules/customers/service.js';
import { TicketService } from './modules/tickets/service.js';
import { assetRoutes } from './modules/assets/routes.js';
import type { Change } from './realtime.js';
import type { DomainEventBus } from './domain-events.js';
import { attachmentRoutes } from './modules/tickets/attachments.js';
import { reportRoutes } from './modules/reports/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { inventoryRoutes } from './modules/inventory/routes.js';
import { Router } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db.js';
import {
  auditLogs,
  customerUsers,
  sessions,
  ticketAssignments,
  tickets,
  tasks,
  users,
} from './schema.js';
import { ApiError, id, now } from './common.js';
import { publicUser } from './modules/identity/dto.js';
import { assignTicket, assignmentInput } from './modules/tickets/assignments.js';
import {
  assertComment,
  assertCustomerAccount,
  assertCustomerTicketList,
  assertTicketCreation,
  assertTicketUpdate,
  customerAccess,
  customerProfile,
  historyForUser,
  requirePermission,
  ticketForUser,
  ticketScope,
  visibleTicket,
} from './modules/identity/policies.js';
import {
  categoryCreate,
  commentCreate,
  customerCreate,
  customerPatch,
  listCustomers,
  listTickets,
  listUsers,
  ticketCreate,
  ticketPatch,
  userCreate,
  userPatch,
} from './domain-schemas.js';
export function routes(
  db: Db,
  attachmentDir?: string,
  publish?: (change: Change) => void,
  domainEvents?: DomainEventBus,
) {
  const router = Router(),
    userService = new UserService(db),
    customerService = new CustomerService(db),
    ticketService = new TicketService(db);
  router.use((req, res, next) => {
    if (!publish || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const ticketId = req.path.match(/^\/tickets\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
    const taskId = req.path.match(/^\/tasks\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
    const previousTicket = ticketId
      ? db.select().from(tickets).where(eq(tickets.id, ticketId)).get()
      : undefined;
    const previousTask = taskId
      ? db.select().from(tasks).where(eq(tasks.id, taskId)).get()
      : undefined;
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const nextTask = taskId
        ? db.select().from(tasks).where(eq(tasks.id, taskId)).get()
        : undefined;
      const target =
        req.path === '/tasks' && typeof req.body?.assigneeId === 'string'
          ? req.body.assigneeId
          : undefined;
      publish({
        actorId: res.locals.user.id,
        staffOnly: req.path.endsWith('/comments') && req.body?.visibility === 'interno',
        ...(ticketId ? { ticketId } : {}),
        extraUserIds: [
          previousTicket?.assignedToUserId,
          previousTask?.assigneeId,
          nextTask?.assigneeId,
          target,
        ].filter((x): x is string => !!x),
      });
    });
    next();
  });
  router.use('/tickets/:id/attachments', attachmentRoutes(db, attachmentDir));
  router.use('/inventory/assets', assetRoutes(db));
  router.use('/inventory', inventoryRoutes(db, domainEvents));
  router.use('/tasks', taskRoutes(db, domainEvents));
  router.use('/reports', reportRoutes(db));
  router.get('/users', requirePermission('users.manage'), (req, res) =>
    res.json(userService.users(listUsers.parse(req.query))),
  );
  router.post('/users', requirePermission('users.manage'), async (req, res) =>
    res
      .status(201)
      .json({ data: await userService.createUser(userCreate.parse(req.body), res.locals.user.id) }),
  );
  router.get('/users/:id', requirePermission('users.manage'), (req, res) =>
    res.json({ data: publicUser(userService.user(id.parse(req.params.id))) }),
  );
  router.patch('/users/:id', requirePermission('users.manage'), (req, res) =>
    res.json({
      data: userService.updateUser(
        id.parse(req.params.id),
        userPatch.parse(req.body),
        res.locals.user.id,
      ),
    }),
  );
  router.put('/users/:id/customer', requirePermission('users.manage'), (req, res) => {
    const userId = id.parse(req.params.id),
      input = z.object({ customerId: id }).strict().parse(req.body);
    const target = userService.user(userId);
    assertCustomerAccount(target);
    const customer = customerService.customer(input.customerId);
    if (customer.status !== 'activo')
      throw new ApiError(400, 'INVALID_CUSTOMER', 'El cliente no está activo.');
    db.transaction((tx) => {
      tx.insert(customerUsers)
        .values({ userId, customerId: input.customerId })
        .onConflictDoUpdate({ target: customerUsers.userId, set: { customerId: input.customerId } })
        .run();
      tx.update(sessions).set({ revokedAt: now() }).where(eq(sessions.userId, userId)).run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'user.customer_linked',
          resourceType: 'user',
          resourceId: userId,
          createdAt: now(),
        })
        .run();
    });
    res.status(204).end();
  });
  router.use('/audit', auditRoutes(db));
  router.get('/technicians', requirePermission('tickets.manage'), (req, res) => {
    const q = z
      .object({
        q: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(100),
      })
      .strict()
      .parse(req.query);
    const where = and(
      eq(users.role, 'tecnico'),
      eq(users.status, 'activo'),
      q.q ? sql`instr(lower(${users.fullName}),lower(${q.q})) > 0` : undefined,
    );
    const total =
      db
        .select({ n: sql<number>`count(*)` })
        .from(users)
        .where(where)
        .get()?.n ?? 0;
    const data = db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(where)
      .orderBy(asc(users.fullName), asc(users.id))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit)
      .all();
    res.json({ data, meta: { page: q.page, limit: q.limit, total } });
  });
  router.get('/customers', requirePermission('customers.read'), (req, res) =>
    res.json(customerService.customers(listCustomers.parse(req.query))),
  );
  router.post('/customers', requirePermission('customers.manage'), (req, res) =>
    res.status(201).json({
      data: customerService.createCustomer(customerCreate.parse(req.body), res.locals.user.id),
    }),
  );
  router.get('/customers/:id', (req, res) => {
    const customerId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    const access = customerAccess(db, user, customerId),
      c = customerService.customer(customerId);
    return res.json({
      data:
        access === 'full'
          ? c
          : { id: c.id, name: c.name, email: c.email, phone: c.phone, status: c.status },
    });
  });
  router.patch('/customers/:id', requirePermission('customers.manage'), (req, res) => {
    const data = customerService.updateCustomer(
      id.parse(req.params.id),
      customerPatch.parse(req.body),
      res.locals.user.id,
    );
    domainEvents?.publish({
      type: 'customer.updated',
      customerId: data.id,
      actorId: res.locals.user.id,
    });
    res.json({ data });
  });
  router.get('/customers/:id/tickets', requirePermission('tickets.read'), (req, res) => {
    const customerId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    assertCustomerTicketList(db, user, customerId);
    customerService.customer(customerId);
    const filters = listTickets.parse(req.query);
    if (user.role === 'cliente' && filters.assignedTo)
      throw new ApiError(403, 'FORBIDDEN', 'Filtro no permitido.');
    const result = ticketService.tickets(
      filters,
      and(eq(tickets.customerId, customerId), ticketScope(db, user)),
    );
    res.json({ ...result, data: result.data.map((t) => ticketForUser(t, user)) });
  });
  router.get('/categories', requirePermission('tickets.read'), (_req, res) =>
    res.json({ data: ticketService.categories().filter((c) => c.active) }),
  );
  router.post('/categories', requirePermission('customers.manage'), (req, res) =>
    res.status(201).json({
      data: ticketService.createCategory(categoryCreate.parse(req.body), res.locals.user.id),
    }),
  );
  router.get('/tickets', requirePermission('tickets.read'), (req, res) => {
    const user = res.locals.user as typeof users.$inferSelect;
    const filters = listTickets.parse(req.query);
    if (user.role === 'cliente' && filters.assignedTo)
      throw new ApiError(403, 'FORBIDDEN', 'Filtro no permitido.');
    const result = ticketService.tickets(filters, ticketScope(db, user));
    res.json({ ...result, data: result.data.map((t) => ticketForUser(t, user)) });
  });
  router.post('/tickets', requirePermission('tickets.create'), (req, res) => {
    const v = ticketCreate.parse(req.body),
      user = res.locals.user as typeof users.$inferSelect;
    assertTicketCreation(db, user, v);
    const ticket = ticketService.createTicket(v, user.id);
    domainEvents?.publish({ type: 'ticket.created', ticketId: ticket.id, actorId: user.id });
    res.status(201).json({ data: ticketForUser(ticket, user) });
  });
  router.get('/tickets/:id', requirePermission('tickets.read'), (req, res) => {
    const user = res.locals.user as typeof users.$inferSelect;
    res.json({ data: ticketForUser(visibleTicket(db, user, id.parse(req.params.id)), user) });
  });
  router.get('/tickets/:id/assignments', requirePermission('assignments.read'), (req, res) => {
    const ticketId = id.parse(req.params.id);
    visibleTicket(db, res.locals.user, ticketId);
    res.json({
      data: db
        .select()
        .from(ticketAssignments)
        .where(eq(ticketAssignments.ticketId, ticketId))
        .orderBy(asc(ticketAssignments.createdAt), asc(ticketAssignments.id))
        .all(),
    });
  });
  router.post('/tickets/:id/assignment', requirePermission('tickets.manage'), (req, res) => {
    const ticketId = id.parse(req.params.id);
    const input = assignmentInput.parse(req.body);
    const data = assignTicket(db, ticketId, res.locals.user.id, input);
    domainEvents?.publish({
      type: 'ticket.assigned',
      ticketId,
      technicianId: input.technicianId,
      actorId: res.locals.user.id,
    });
    res.json({ data });
  });
  router.patch('/tickets/:id', requirePermission('tickets.work'), (req, res) => {
    const ticketId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    const current = visibleTicket(db, user, ticketId);
    const v = ticketPatch.parse(req.body);
    assertTicketUpdate(user, current, v);
    if (v.assignedToUserId !== undefined)
      throw new ApiError(400, 'USE_ASSIGNMENT_ENDPOINT', 'Utilice el endpoint de asignación.');
    const data = ticketService.updateTicket(ticketId, v, user.id);
    if (v.status === 'resuelto')
      domainEvents?.publish({ type: 'ticket.resolved', ticketId, actorId: user.id });
    res.json({ data });
  });
  router.post('/tickets/:id/archive', requirePermission('tickets.manage'), (req, res) =>
    res.json({ data: ticketService.archiveTicket(id.parse(req.params.id), res.locals.user.id) }),
  );
  router.post('/tickets/:id/comments', requirePermission('tickets.comment'), (req, res) => {
    const ticketId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    visibleTicket(db, user, ticketId);
    const v = commentCreate.parse(req.body);
    assertComment(user, v.visibility);
    res.status(201).json({ data: ticketService.addComment(ticketId, v, user.id) });
  });
  router.get('/tickets/:id/history', requirePermission('tickets.read'), (req, res) => {
    const ticketId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    visibleTicket(db, user, ticketId);
    const data = ticketService.history(ticketId);
    res.json({ data: historyForUser(user, data) });
  });
  router.use('/notifications', notificationRoutes(db));
  router.get('/profile', (_req, res) =>
    res.json({
      data: {
        ...publicUser(res.locals.user),
        ...customerProfile(db, res.locals.user),
      },
    }),
  );
  router.patch('/profile', (req, res) => {
    const v = z
      .object({ fullName: z.string().trim().min(1).max(200) })
      .strict()
      .parse(req.body);
    const row = db.transaction((tx) => {
      const date = now();
      const updated = tx
        .update(users)
        .set({ ...v, updatedAt: date })
        .where(eq(users.id, res.locals.user.id))
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: updated.id,
          action: 'profile.updated',
          resourceType: 'profile',
          resourceId: updated.id,
          createdAt: date,
        })
        .run();
      return updated;
    });
    res.json({ data: publicUser(row) });
  });
  return router;
}
