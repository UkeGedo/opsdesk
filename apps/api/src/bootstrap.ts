import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { securityEvents, users } from './schema.js';
import { openDatabase } from './db.js';
import { now } from './common.js';
const input = z
  .object({
    BOOTSTRAP_NAME: z.string().trim().min(2).max(120),
    BOOTSTRAP_EMAIL: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    BOOTSTRAP_PASSWORD: z.string().min(12).max(256),
  })
  .parse(process.env);
const { db, sqlite } = openDatabase();
try {
  const passwordHash = await argon2.hash(input.BOOTSTRAP_PASSWORD, { type: argon2.argon2id });
  db.transaction((tx) => {
    if (tx.select({ id: users.id }).from(users).get())
      throw new Error('La inicialización solo se permite con la tabla de usuarios vacía.');
    const date = now();
    const administratorId = randomUUID();
    tx.insert(users)
      .values({
        id: administratorId,
        fullName: input.BOOTSTRAP_NAME,
        email: input.BOOTSTRAP_EMAIL,
        passwordHash,
        role: 'administrador',
        status: 'activo',
        createdAt: date,
        updatedAt: date,
      })
      .run();
    tx.insert(securityEvents)
      .values({
        id: randomUUID(),
        actorId: administratorId,
        action: 'user.bootstrap',
        resourceType: 'user',
        resourceId: administratorId,
        outcome: 'success',
        createdAt: date,
      })
      .run();
  });
  console.log('Administrador creado.');
} finally {
  sqlite.close();
}
