import { afterAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SMTPServer } from 'smtp-server';
import request from 'supertest';
import argon2 from 'argon2';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { users } from './schema.js';
const dir = mkdtempSync(join(tmpdir(), 'opsdesk-smtp-'));
const keyPath = join(dir, 'key.pem'),
  certPath = join(dir, 'cert.pem');
const windowsOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe';
execFileSync(
  existsSync(windowsOpenSsl) ? windowsOpenSsl : 'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ],
  {
    stdio: 'ignore',
    env: {
      ...process.env,
      ...(existsSync(windowsOpenSsl)
        ? { OPENSSL_CONF: 'C:/Program Files/Git/usr/ssl/openssl.cnf' }
        : {}),
    },
  },
);
const messages: string[] = [];
const server = new SMTPServer({
  secure: true,
  key: readFileSync(keyPath),
  cert: readFileSync(certPath),
  authOptional: true,
  onData(stream, _session, done) {
    let message = '';
    stream.on('data', (chunk) => {
      message += chunk.toString();
    });
    stream.on('end', () => {
      messages.push(message);
      done();
    });
  },
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve());
});
const address = server.server.address();
if (!address || typeof address === 'string') throw new Error('SMTP de prueba no disponible');
process.env.NODE_ENV = 'test';
process.env.MAIL_MODE = 'smtp';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = String(address.port);
process.env.SMTP_SECURE = 'true';
process.env.SMTP_FROM = 'noreply@example.test';
process.env.SMTP_CA_FILE = certPath;
const { openDatabase } = await import('./db.js');
const { createApp } = await import('./app.js');
const { db, sqlite } = openDatabase(join(dir, 'test.db'));
migrate(db, { migrationsFolder: './drizzle' });
const date = new Date().toISOString();
db.insert(users)
  .values({
    id: randomUUID(),
    fullName: 'Prueba SMTP',
    email: 'smtp@example.test',
    passwordHash: await argon2.hash('contraseña-prueba-123', { type: argon2.argon2id }),
    role: 'cliente',
    status: 'activo',
    createdAt: date,
    updatedAt: date,
  })
  .run();
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});
it('entrega el enlace por SMTP con TLS y permite consumirlo una sola vez', async () => {
  const app = createApp(db);
  const result = await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'smtp@example.test' });
  expect(result.status).toBe(202);
  expect(JSON.stringify(result.body)).not.toContain('token');
  for (let i = 0; i < 100 && !messages.length; i++) await new Promise((r) => setTimeout(r, 25));
  expect(messages).toHaveLength(1);
  const message = messages[0].replace(/=\r?\n/g, '');
  const token = message.match(/#([A-Za-z0-9_-]{43})/)?.[1];
  expect(token).toBeTruthy();
  expect(
    (
      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'nueva-contraseña-123' })
    ).status,
  ).toBe(204);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'nueva-contraseña-123' })
    ).status,
  ).toBe(400);
});
