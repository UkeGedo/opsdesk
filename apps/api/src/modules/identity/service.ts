import argon2 from 'argon2';
import { publicUser } from './dto.js';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, notFound, now } from '../../common.js';
import type { Db } from '../../db.js';
import { listUsers, userCreate, userPatch } from '../../domain-schemas.js';
import { auditLogs, customerUsers, passwordResets, sessions, users } from '../../schema.js';
import { matching, page, result } from '../shared/query.js';

export class UserService {
  constructor(private db: Db) {}

  user(idValue: string) {
    const row = this.db.select().from(users).where(eq(users.id, idValue)).get();
    if (!row) throw notFound();
    return row;
  }

  async createUser(v: z.infer<typeof userCreate>, actor: string) {
    const passwordHash = await argon2.hash(v.password, { type: argon2.argon2id });
    const date = now();
    return this.db.transaction((tx) => {
      const currentActor = tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, actor), eq(users.status, 'activo'), eq(users.role, 'administrador')),
        )
        .get();
      if (!currentActor)
        throw new ApiError(403, 'FORBIDDEN', 'No tiene permisos para esta operación.');
      const row = tx
        .insert(users)
        .values({
          id: randomUUID(),
          fullName: v.fullName,
          email: v.email,
          passwordHash,
          role: v.role,
          status: v.status,
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'user.created',
          resourceType: 'user',
          resourceId: row.id,
          createdAt: date,
        })
        .run();
      return publicUser(row);
    });
  }

  updateUser(idValue: string, v: z.infer<typeof userPatch>, actor: string) {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(users).where(eq(users.id, idValue)).get();
      if (!existing) throw notFound();
      if (
        existing.role === 'administrador' &&
        existing.status === 'activo' &&
        ((v.role && v.role !== 'administrador') || v.status === 'inactivo')
      ) {
        const admins = tx
          .select({ n: sql<number>`count(*)` })
          .from(users)
          .where(and(eq(users.role, 'administrador'), eq(users.status, 'activo')))
          .get()!.n;
        if (admins <= 1)
          throw new ApiError(409, 'LAST_ADMIN', 'Debe permanecer un administrador activo.');
      }
      const row = tx
        .update(users)
        .set({ ...v, updatedAt: now() })
        .where(eq(users.id, idValue))
        .returning()
        .get();
      if (v.role && v.role !== existing.role)
        tx.delete(customerUsers).where(eq(customerUsers.userId, idValue)).run();
      if (
        v.status === 'inactivo' ||
        (v.role && v.role !== existing.role) ||
        (v.email && v.email !== existing.email)
      )
        tx.update(sessions).set({ revokedAt: now() }).where(eq(sessions.userId, idValue)).run();
      if (
        v.status === 'inactivo' ||
        (v.email && v.email !== existing.email) ||
        (v.role && v.role !== existing.role)
      )
        tx.update(passwordResets)
          .set({ usedAt: now() })
          .where(and(eq(passwordResets.userId, idValue), isNull(passwordResets.usedAt)))
          .run();
      if (v.role && v.role !== existing.role)
        tx.insert(auditLogs)
          .values({
            id: randomUUID(),
            actorId: actor,
            action: 'user.role_changed',
            resourceType: 'user',
            resourceId: idValue,
            context: JSON.stringify({ from: existing.role, to: v.role }),
            createdAt: now(),
          })
          .run();
      if (v.status === 'inactivo' && existing.status !== 'inactivo')
        tx.insert(auditLogs)
          .values({
            id: randomUUID(),
            actorId: actor,
            action: 'user.deactivated',
            resourceType: 'user',
            resourceId: idValue,
            createdAt: now(),
          })
          .run();
      tx.insert(auditLogs)
        .values({
          id: randomUUID(),
          actorId: actor,
          action: 'user.updated',
          resourceType: 'user',
          resourceId: idValue,
          createdAt: now(),
        })
        .run();
      return publicUser(row);
    });
  }

  users(v: z.infer<typeof listUsers>) {
    const where = and(
      v.status ? eq(users.status, v.status) : undefined,
      v.q ? or(matching(users.fullName, v.q), matching(users.email, v.q)) : undefined,
    );
    const col = { fullName: users.fullName, email: users.email, createdAt: users.createdAt }[
      v.sort
    ];
    const data = this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(v.order === 'asc' ? asc(col) : desc(col), asc(users.id))
      .limit(page(v).limit)
      .offset(page(v).offset)
      .all()
      .map(publicUser);
    const total = this.db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(where)
      .get()!.n;
    return result(data, total, v);
  }
}
