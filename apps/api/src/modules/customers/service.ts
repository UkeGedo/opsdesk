import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CustomerRecord } from '@opsdesk/shared/contracts';
import { ApiError, notFound, now } from '../../common.js';
import type { Db } from '../../db.js';
import {
  customerCreate,
  customerPatch,
  documentPair,
  listCustomers,
} from '../../domain-schemas.js';
import { auditLogs, customers } from '../../schema.js';
import { matching, page, result } from '../shared/query.js';

export class CustomerService {
  constructor(private db: Db) {}

  customer(idValue: string) {
    const row = this.db.select().from(customers).where(eq(customers.id, idValue)).get();
    if (!row) throw notFound();
    return row satisfies CustomerRecord;
  }

  customers(v: z.infer<typeof listCustomers>) {
    const where = and(
      v.status ? eq(customers.status, v.status) : undefined,
      v.q
        ? or(
            matching(customers.name, v.q),
            matching(customers.email, v.q),
            matching(customers.documentNumber, v.q),
          )
        : undefined,
    );
    const col = { name: customers.name, email: customers.email, createdAt: customers.createdAt }[
      v.sort
    ];
    const data = this.db
      .select()
      .from(customers)
      .where(where)
      .orderBy(v.order === 'asc' ? asc(col) : desc(col), asc(customers.id))
      .limit(page(v).limit)
      .offset(page(v).offset)
      .all();
    const total = this.db
      .select({ n: sql<number>`count(*)` })
      .from(customers)
      .where(where)
      .get()!.n;
    return result(data, total, v);
  }

  createCustomer(v: z.infer<typeof customerCreate>, actor: string) {
    return this.db.transaction((tx) => {
      const date = now();
      const row = tx
        .insert(customers)
        .values({
          ...v,
          documentType: v.documentType || null,
          documentNumber: v.documentNumber || null,
          id: randomUUID(),
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'customer.created',
          resourceType: 'customer',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return row;
    });
  }

  updateCustomer(idValue: string, v: z.infer<typeof customerPatch>, actor: string) {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(customers).where(eq(customers.id, idValue)).get();
      if (!existing) throw notFound();
      const { expectedUpdatedAt, ...changes } = v;
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt)
        throw new ApiError(
          409,
          'STALE_CUSTOMER',
          'El cliente cambió; cierra el formulario y vuelve a editarlo.',
        );
      if (!documentPair({ ...existing, ...changes }))
        throw new ApiError(400, 'VALIDATION_ERROR', 'Indique tipo y número de documento juntos.');
      const date = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
      const row = tx
        .update(customers)
        .set({ ...changes, updatedAt: date })
        .where(and(eq(customers.id, idValue), eq(customers.updatedAt, existing.updatedAt)))
        .returning()
        .get();
      if (!row)
        throw new ApiError(
          409,
          'STALE_CUSTOMER',
          'El cliente cambió; cierra el formulario y vuelve a editarlo.',
        );
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'customer.updated',
          resourceType: 'customer',
          resourceId: idValue,
          createdAt: date,
        })
        .run();
      return row;
    });
  }
}
