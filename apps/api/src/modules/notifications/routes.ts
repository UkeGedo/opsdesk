import { Router } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { notifications, tickets, users } from '../../schema.js';
import { ApiError, id, now } from '../../common.js';
import { ticketScope, visibleTicket } from '../identity/policies.js';
export function notificationRoutes(db: Db) {
  const router = Router();
  router.get('/', (req, res) => {
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
  router.get('/:id', (req, res) => {
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
  router.post('/read', (req, res) => {
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
  return router;
}
