import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { ApiError, id, now } from '../../common.js';
import { auditLogs, services, slaPolicies } from '../../schema.js';
import { requirePermission, visibleTicket } from '../identity/policies.js';
import { validateCalendar } from './sla.js';
import { slaForTicket } from './store.js';
import { responseTemplateRoutes } from './templates.js';
import { serviceCatalogRoutes } from './services.js';
import { priorityRoutes } from './priority.js';
import { savedViewRoutes } from './views.js';

const interval = z
  .object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1440) })
  .strict();
const calendarSchema = z
  .object({
    timeZone: z.string().min(1).max(100),
    weekly: z.partialRecord(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.array(interval).max(12)),
    exceptions: z.record(z.string(), z.array(interval).max(12)),
  })
  .strict();
const input = z
  .object({
    name: z.string().trim().min(1).max(120),
    serviceId: id.nullable().default(null),
    priority: z.enum(['baja', 'media', 'alta', 'urgente']).nullable(),
    effectiveFrom: z.iso.datetime().transform((value) => new Date(value).toISOString()),
    effectiveUntil: z.iso
      .datetime()
      .transform((value) => new Date(value).toISOString())
      .nullable()
      .default(null),
    firstResponseMs: z
      .number()
      .int()
      .min(60000)
      .max(90 * 86400000),
    resolutionMs: z
      .number()
      .int()
      .min(60000)
      .max(90 * 86400000),
    calendar: calendarSchema,
    pauseStatuses: z
      .array(z.enum(['pendiente_cliente']))
      .max(1)
      .default([]),
  })
  .strict()
  .refine((v) => !v.effectiveUntil || v.effectiveFrom < v.effectiveUntil, {
    message: 'La vigencia final debe ser posterior al inicio.',
  });

function validatePolicyCalendar(calendar: z.infer<typeof calendarSchema>) {
  try {
    validateCalendar(calendar);
  } catch {
    throw new ApiError(
      400,
      'INVALID_CALENDAR',
      'El calendario contiene horarios, fechas o zona horaria no válidos.',
    );
  }
  if (!Object.values(calendar.weekly).some((intervals) => intervals && intervals.length > 0))
    throw new ApiError(
      400,
      'INVALID_CALENDAR',
      'El calendario requiere horas de atención semanales.',
    );
}

export function serviceDeskRoutes(db: Db) {
  const router = Router();
  router.use('/response-templates', responseTemplateRoutes(db));
  router.use('/services', serviceCatalogRoutes(db));
  router.use('/priority-matrix', priorityRoutes(db));
  router.use('/views', savedViewRoutes(db));
  router.get('/policies', requirePermission('users.manage'), (_req, res) => {
    res.json({
      data: db
        .select()
        .from(slaPolicies)
        .all()
        .map((p) => ({
          ...p,
          calendar: JSON.parse(p.calendar),
          pauseStatuses: JSON.parse(p.pauseStatuses),
        })),
    });
  });
  router.post('/policies', requirePermission('users.manage'), (req, res) => {
    const v = input.parse(req.body);
    validatePolicyCalendar(v.calendar);
    const data = db.transaction((tx) => {
      if (v.serviceId && !tx.select().from(services).where(eq(services.id, v.serviceId)).get())
        throw new ApiError(400, 'INVALID_SERVICE', 'El servicio no existe.');
      const overlap = tx
        .select()
        .from(slaPolicies)
        .where(eq(slaPolicies.active, true))
        .all()
        .some(
          (p) =>
            p.priority === v.priority &&
            p.serviceId === v.serviceId &&
            (!p.effectiveUntil || p.effectiveUntil > v.effectiveFrom) &&
            (!v.effectiveUntil || p.effectiveFrom < v.effectiveUntil),
        );
      if (overlap)
        throw new ApiError(
          409,
          'POLICY_OVERLAP',
          'Ya existe una política vigente para esa prioridad y periodo.',
        );
      const date = now(),
        policyId = randomUUID();
      tx.insert(slaPolicies)
        .values({
          id: policyId,
          name: v.name,
          version: 1,
          serviceId: v.serviceId,
          priority: v.priority,
          effectiveFrom: v.effectiveFrom,
          effectiveUntil: v.effectiveUntil,
          firstResponseMs: v.firstResponseMs,
          resolutionMs: v.resolutionMs,
          calendar: JSON.stringify(v.calendar),
          pauseStatuses: JSON.stringify(v.pauseStatuses),
          createdAt: date,
          createdBy: res.locals.user.id,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'sla.policy_created',
          resourceType: 'sla_policy',
          resourceId: policyId,
          createdAt: date,
        })
        .run();
      return { id: policyId, ...v, version: 1 };
    });
    res.status(201).json({ data });
  });
  router.post('/policies/:id/versions', requirePermission('users.manage'), (req, res) => {
    const policyId = id.parse(req.params.id),
      v = input.parse(req.body);
    validatePolicyCalendar(v.calendar);
    const data = db.transaction((tx) => {
      const previous = tx.select().from(slaPolicies).where(eq(slaPolicies.id, policyId)).get();
      if (!previous) throw new ApiError(404, 'NOT_FOUND', 'La política no existe.');
      if (
        !previous.active ||
        previous.effectiveUntil ||
        previous.priority !== v.priority ||
        previous.serviceId !== v.serviceId ||
        v.effectiveUntil
      )
        throw new ApiError(
          409,
          'INVALID_POLICY_VERSION',
          'Solo se puede versionar la última política abierta sin cambiar su prioridad.',
        );
      const date = new Date(
        Math.max(Date.now(), Date.parse(previous.effectiveFrom) + 1),
      ).toISOString();
      const nextId = randomUUID();
      tx.update(slaPolicies)
        .set({ effectiveUntil: date })
        .where(eq(slaPolicies.id, previous.id))
        .run();
      tx.insert(slaPolicies)
        .values({
          id: nextId,
          name: v.name,
          version: previous.version + 1,
          serviceId: previous.serviceId,
          priority: previous.priority,
          effectiveFrom: date,
          effectiveUntil: null,
          firstResponseMs: v.firstResponseMs,
          resolutionMs: v.resolutionMs,
          calendar: JSON.stringify(v.calendar),
          pauseStatuses: JSON.stringify(v.pauseStatuses),
          createdAt: now(),
          createdBy: res.locals.user.id,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'sla.policy_versioned',
          resourceType: 'sla_policy',
          resourceId: nextId,
          context: JSON.stringify({ previousId: previous.id }),
          createdAt: now(),
        })
        .run();
      return { id: nextId, version: previous.version + 1, effectiveFrom: date };
    });
    res.status(201).json({ data });
  });
  return router;
}

export function ticketSlaRoute(db: Db) {
  const router = Router({ mergeParams: true });
  router.get('/', requirePermission('tickets.read'), (req, res) => {
    const ticketId = id.parse(req.params.id);
    visibleTicket(db, res.locals.user, ticketId);
    res.json({ data: slaForTicket(db, ticketId, now()) });
  });
  return router;
}
