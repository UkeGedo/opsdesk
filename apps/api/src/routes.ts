import { assetRoutes } from './assets.js';
import type { Change } from './realtime.js';
import { attachmentRoutes } from './attachments.js';
import { reportRoutes } from './reports.js';
import { taskRoutes } from './tasks.js';
import { inventoryRoutes } from './inventory.js';
import { Router } from 'express';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db.js';
import {
  auditLogs,
  customerUsers,
  notifications,
  securityEvents,
  sessions,
  ticketAssignments,
  tickets,
  tasks,
  users,
} from './schema.js';
import { ApiError, id, now } from './common.js';
import { publicUser } from './auth.js';
import { event } from './security.js';
import { assignTicket, assignmentInput } from './assignments.js';
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
} from './policies.js';
import {
  Domain,
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
} from './domain.js';
export function routes(db: Db, attachmentDir?: string, publish?: (change: Change) => void) {
  const router = Router(),
    service = new Domain(db);
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
  router.use('/inventory', inventoryRoutes(db));
  router.use('/tasks', taskRoutes(db));
  router.use('/reports', reportRoutes(db));
  router.get('/users', requirePermission('users.manage'), (req, res) =>
    res.json(service.users(listUsers.parse(req.query))),
  );
  router.post('/users', requirePermission('users.manage'), async (req, res) =>
    res
      .status(201)
      .json({ data: await service.createUser(userCreate.parse(req.body), res.locals.user.id) }),
  );
  router.get('/users/:id', requirePermission('users.manage'), (req, res) =>
    res.json({ data: publicUser(service.user(id.parse(req.params.id))) }),
  );
  router.patch('/users/:id', requirePermission('users.manage'), (req, res) =>
    res.json({
      data: service.updateUser(
        id.parse(req.params.id),
        userPatch.parse(req.body),
        res.locals.user.id,
      ),
    }),
  );
  router.put('/users/:id/customer', requirePermission('users.manage'), (req, res) => {
    const userId = id.parse(req.params.id),
      input = z.object({ customerId: id }).strict().parse(req.body);
    const target = service.user(userId);
    assertCustomerAccount(target);
    const customer = service.customer(input.customerId);
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
  router.get('/audit', requirePermission('audit.read'), (req, res) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .strict()
      .parse(req.query);
    const data = db
      .select()
      .from(securityEvents)
      .orderBy(asc(securityEvents.createdAt), asc(securityEvents.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();
    const business = db
      .select()
      .from(auditLogs)
      .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();
    event(db, 'audit.read', 'success', res.locals.user.id, 'audit');
    res.json({ data: { security: data, business }, meta: query });
  });
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
    res.json(service.customers(listCustomers.parse(req.query))),
  );
  router.post('/customers', requirePermission('customers.manage'), (req, res) =>
    res
      .status(201)
      .json({ data: service.createCustomer(customerCreate.parse(req.body), res.locals.user.id) }),
  );
  router.get('/customers/:id', (req, res) => {
    const customerId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    const access = customerAccess(db, user, customerId),
      c = service.customer(customerId);
    return res.json({
      data:
        access === 'full'
          ? c
          : { id: c.id, name: c.name, email: c.email, phone: c.phone, status: c.status },
    });
  });
  router.patch('/customers/:id', requirePermission('customers.manage'), (req, res) =>
    res.json({
      data: service.updateCustomer(
        id.parse(req.params.id),
        customerPatch.parse(req.body),
        res.locals.user.id,
      ),
    }),
  );
  router.get('/customers/:id/tickets', requirePermission('tickets.read'), (req, res) => {
    const customerId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    assertCustomerTicketList(db, user, customerId);
    service.customer(customerId);
    const filters = listTickets.parse(req.query);
    if (user.role === 'cliente' && filters.assignedTo)
      throw new ApiError(403, 'FORBIDDEN', 'Filtro no permitido.');
    const result = service.tickets(
      filters,
      and(eq(tickets.customerId, customerId), ticketScope(db, user)),
    );
    res.json({ ...result, data: result.data.map((t) => ticketForUser(t, user)) });
  });
  router.get('/categories', requirePermission('tickets.read'), (_req, res) =>
    res.json({ data: service.categories().filter((c) => c.active) }),
  );
  router.post('/categories', requirePermission('customers.manage'), (req, res) =>
    res
      .status(201)
      .json({ data: service.createCategory(categoryCreate.parse(req.body), res.locals.user.id) }),
  );
  router.get('/tickets', requirePermission('tickets.read'), (req, res) => {
    const user = res.locals.user as typeof users.$inferSelect;
    const filters = listTickets.parse(req.query);
    if (user.role === 'cliente' && filters.assignedTo)
      throw new ApiError(403, 'FORBIDDEN', 'Filtro no permitido.');
    const result = service.tickets(filters, ticketScope(db, user));
    res.json({ ...result, data: result.data.map((t) => ticketForUser(t, user)) });
  });
  router.post('/tickets', requirePermission('tickets.create'), (req, res) => {
    const v = ticketCreate.parse(req.body),
      user = res.locals.user as typeof users.$inferSelect;
    assertTicketCreation(db, user, v);
    res.status(201).json({ data: ticketForUser(service.createTicket(v, user.id), user) });
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
    res.json({ data: assignTicket(db, ticketId, res.locals.user.id, input) });
  });
  router.patch('/tickets/:id', requirePermission('tickets.work'), (req, res) => {
    const ticketId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    const current = visibleTicket(db, user, ticketId);
    const v = ticketPatch.parse(req.body);
    assertTicketUpdate(user, current, v);
    if (v.assignedToUserId !== undefined)
      throw new ApiError(400, 'USE_ASSIGNMENT_ENDPOINT', 'Utilice el endpoint de asignación.');
    res.json({ data: service.updateTicket(ticketId, v, user.id) });
  });
  router.post('/tickets/:id/archive', requirePermission('tickets.manage'), (req, res) =>
    res.json({ data: service.archiveTicket(id.parse(req.params.id), res.locals.user.id) }),
  );
  router.post('/tickets/:id/comments', requirePermission('tickets.comment'), (req, res) => {
    const ticketId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    visibleTicket(db, user, ticketId);
    const v = commentCreate.parse(req.body);
    assertComment(user, v.visibility);
    res.status(201).json({ data: service.addComment(ticketId, v, user.id) });
  });
  router.get('/tickets/:id/history', requirePermission('tickets.read'), (req, res) => {
    const ticketId = id.parse(req.params.id),
      user = res.locals.user as typeof users.$inferSelect;
    visibleTicket(db, user, ticketId);
    const data = service.history(ticketId);
    res.json({ data: historyForUser(user, data) });
  });
  router.get('/notifications', (req, res) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
      .strict()
      .parse(req.query);
    const user = res.locals.user as typeof users.$inferSelect;
    const rows = db
      .select({ notification: notifications })
      .from(notifications)
      .innerJoin(tickets, eq(notifications.ticketId, tickets.id))
      .where(and(eq(notifications.recipientId, user.id), ticketScope(db, user)))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.limit)
      .all();
    const data = rows.map((row) => row.notification);
    res.json({ data });
  });
  router.get('/notifications/:id', (req, res) => {
    const user = res.locals.user as typeof users.$inferSelect,
      notificationId = id.parse(req.params.id);
    const row = db
      .select({ notification: notifications })
      .from(notifications)
      .innerJoin(tickets, eq(notifications.ticketId, tickets.id))
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.recipientId, user.id),
          ticketScope(db, user),
        ),
      )
      .get();
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado.');
    res.json({ data: row.notification });
  });
  router.post('/notifications/read', (req, res) => {
    const input = z
      .object({ ids: z.array(id).min(1).max(100) })
      .strict()
      .parse(req.body);
    const user = res.locals.user as typeof users.$inferSelect;
    db.transaction((tx) => {
      for (const notificationId of new Set(input.ids)) {
        const row = tx
          .select()
          .from(notifications)
          .where(and(eq(notifications.id, notificationId), eq(notifications.recipientId, user.id)))
          .get();
        if (!row) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado.');
        visibleTicket(db, user, row.ticketId);
        tx.update(notifications)
          .set({ readAt: now() })
          .where(and(eq(notifications.id, row.id), isNull(notifications.readAt)))
          .run();
      }
    });
    res.status(204).end();
  });
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
