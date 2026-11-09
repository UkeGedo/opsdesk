import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { auditLogs, priorityMatrices } from '../../schema.js';
import { ApiError, now } from '../../common.js';
import { requirePermission } from '../identity/policies.js';
import { levels, type Matrix } from './policies.js';

const level = z.enum(levels);
const input = z
  .object({
    matrix: z.record(level, z.record(level, level)),
    expectedVersion: z.number().int().positive().nullable(),
  })
  .strict();
export function latestMatrix(db: Pick<Db, 'select'>) {
  const row = db.select().from(priorityMatrices).orderBy(desc(priorityMatrices.version)).get();
  return row ? { ...row, matrix: JSON.parse(row.matrix) as Matrix } : null;
}
export function priorityRoutes(db: Db) {
  const router = Router();
  router.get('/', requirePermission('tickets.read'), (_req, res) =>
    res.json({ data: latestMatrix(db) }),
  );
  router.post('/', requirePermission('users.manage'), (req, res) => {
    const { matrix, expectedVersion } = input.parse(req.body);
    const data = db.transaction((tx) => {
      const previous = latestMatrix(tx),
        date = now(),
        matrixId = randomUUID();
      if ((previous?.version ?? null) !== expectedVersion)
        throw new ApiError(409, 'STALE_MATRIX', 'La matriz cambió; actualice los datos.');
      const version = (previous?.version ?? 0) + 1;
      tx.insert(priorityMatrices)
        .values({
          id: matrixId,
          version,
          matrix: JSON.stringify(matrix),
          createdAt: date,
          createdBy: res.locals.user.id,
        })
        .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: res.locals.user.id,
          action: 'priority_matrix.created',
          resourceType: 'priority_matrix',
          resourceId: matrixId,
          createdAt: date,
        })
        .run();
      return { id: matrixId, version, matrix };
    });
    res.status(201).json({ data });
  });
  return router;
}
