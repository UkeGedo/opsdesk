import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
  categories,
  counters,
  customerUsers,
  customers,
  passwordResets,
  sessions,
  tickets,
  users,
} from './schema.js';
import { eq } from 'drizzle-orm';
import { digest, randomToken } from './security.js';
const dir = mkdtempSync(join(tmpdir(), 'opsdesk-security-'));
process.env.MAIL_MODE = 'file';
process.env.MAIL_DIR = join(dir, 'mail');
const { openDatabase } = await import('./db.js');
const { createApp } = await import('./app.js');
const connection = openDatabase(join(dir, 'test.db'));
const { db, sqlite } = connection;
migrate(db, { migrationsFolder: './drizzle' });
const app = createApp(db);
const admin = request.agent(app),
  supervisor = request.agent(app),
  technician = request.agent(app),
  client = request.agent(app),
  otherClient = request.agent(app),
  secondAdmin = request.agent(app);
const ids = {
  admin: randomUUID(),
  supervisor: randomUUID(),
  technician: randomUUID(),
  client: randomUUID(),
  other: randomUUID(),
  inactive: randomUUID(),
  customer: randomUUID(),
  otherCustomer: randomUUID(),
  category: randomUUID(),
  ownTicket: randomUUID(),
  otherTicket: randomUUID(),
};
const password = 'clave-de-prueba-123';
let adminCsrf = '',
  techCsrf = '',
  supervisorCsrf = '',
  clientCsrf = '',
  secondCsrf = '';
const ticketVersion = (ticketId: string) =>
  db.select().from(tickets).where(eq(tickets.id, ticketId)).get()!.updatedAt;
const login = (agent: ReturnType<typeof request.agent>, email: string, pass = password) =>
  agent.post('/api/v1/auth/login').send({ email, password: pass });
beforeAll(async () => {
  const date = new Date().toISOString(),
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  db.insert(users)
    .values(
      [
        {
          id: ids.admin,
          fullName: 'Admin',
          email: 'admin@example.test',
          role: 'administrador' as const,
          status: 'activo' as const,
        },
        {
          id: ids.supervisor,
          fullName: 'Super',
          email: 'super@example.test',
          role: 'supervisor' as const,
          status: 'activo' as const,
        },
        {
          id: ids.technician,
          fullName: 'Técnico',
          email: 'tech@example.test',
          role: 'tecnico' as const,
          status: 'activo' as const,
        },
        {
          id: ids.client,
          fullName: 'Cliente',
          email: 'client@example.test',
          role: 'cliente' as const,
          status: 'activo' as const,
        },
        {
          id: ids.other,
          fullName: 'Otro',
          email: 'other@example.test',
          role: 'cliente' as const,
          status: 'activo' as const,
        },
        {
          id: ids.inactive,
          fullName: 'Inactivo',
          email: 'inactive@example.test',
          role: 'tecnico' as const,
          status: 'inactivo' as const,
        },
      ].map((u) => ({ ...u, passwordHash, createdAt: date, updatedAt: date })),
    )
    .run();
  db.insert(customers)
    .values([
      {
        id: ids.customer,
        name: 'Primero',
        status: 'activo' as const,
        createdAt: date,
        updatedAt: date,
      },
      {
        id: ids.otherCustomer,
        name: 'Segundo',
        status: 'activo' as const,
        createdAt: date,
        updatedAt: date,
      },
    ])
    .run();
  db.insert(customerUsers)
    .values([
      { userId: ids.client, customerId: ids.customer },
      { userId: ids.other, customerId: ids.otherCustomer },
    ])
    .run();
  db.insert(categories).values({ id: ids.category, name: 'Soporte', active: true }).run();
  db.insert(tickets)
    .values(
      [
        {
          id: ids.ownTicket,
          ticketNumber: 1,
          customerId: ids.customer,
          assignedToUserId: ids.technician,
        },
        {
          id: ids.otherTicket,
          ticketNumber: 2,
          customerId: ids.otherCustomer,
          assignedToUserId: null,
        },
      ].map((t) => ({
        ...t,
        categoryId: ids.category,
        title: 'Incidencia',
        description: 'Detalle',
        priority: 'media' as const,
        status: 'abierto' as const,
        createdByUserId: ids.admin,
        createdAt: date,
        updatedAt: date,
      })),
    )
    .run();
  adminCsrf = (await login(admin, 'admin@example.test')).body.data.csrfToken;
  techCsrf = (await login(technician, 'tech@example.test')).body.data.csrfToken;
  clientCsrf = (await login(client, 'client@example.test')).body.data.csrfToken;
  await login(otherClient, 'other@example.test');
  supervisorCsrf = (await login(supervisor, 'super@example.test')).body.data.csrfToken;
  db.insert(counters).values({ name: 'ticket', value: 2 }).run();
  secondCsrf = (await login(secondAdmin, 'admin@example.test')).body.data.csrfToken;
});
afterAll(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MAIL_MODE;
  delete process.env.MAIL_DIR;
});
describe('seguridad y autorización', () => {
  it('rechaza credenciales, cuentas inactivas y cookies inválidas', async () => {
    const missing = await request(app).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', 'opsdesk_session=invalid')).status,
    ).toBe(401);
    const a = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'inactive@example.test', password });
    const b = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'none@example.test', password });
    expect(a.status).toBe(401);
    expect(a.body.error.code).toBe(b.body.error.code);
  });
  it('aplica CSRF por sesión y origen', async () => {
    const body = { name: 'Intento' };
    expect((await admin.post('/api/v1/customers').send(body)).status).toBe(403);
    expect(
      (await admin.post('/api/v1/customers').set('X-CSRF-Token', 'invalido').send(body)).status,
    ).toBe(403);
    expect(
      (await admin.post('/api/v1/customers').set('X-CSRF-Token', clientCsrf).send(body)).status,
    ).toBe(403);
    expect(
      (
        await admin
          .post('/api/v1/customers')
          .set('Origin', 'https://hostil.example')
          .set('X-CSRF-Token', adminCsrf)
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (await admin.post('/api/v1/customers').set('X-CSRF-Token', adminCsrf).send(body)).status,
    ).toBe(201);
  });
  it('limita las consultas y acciones al rol y recurso', async () => {
    expect((await supervisor.get('/api/v1/customers')).status).toBe(200);
    expect(
      (await supervisor.post('/api/v1/users').set('X-CSRF-Token', supervisorCsrf).send({})).status,
    ).toBe(403);
    const own = await client.get('/api/v1/tickets');
    expect(own.body.data.map((t: { id: string }) => t.id)).toEqual([ids.ownTicket]);
    expect((await client.get(`/api/v1/tickets/${ids.otherTicket}`)).status).toBe(404);
    expect((await otherClient.get(`/api/v1/tickets/${ids.ownTicket}`)).status).toBe(404);
    expect((await technician.get(`/api/v1/tickets/${ids.otherTicket}`)).status).toBe(404);
    expect((await client.get('/api/v1/users')).status).toBe(403);
    expect((await client.get('/api/v1/tickets?assignedTo=unassigned')).status).toBe(403);
    expect(
      (await supervisor.get('/api/v1/tickets?assignedTo=unassigned')).body.data.map(
        (t: { id: string }) => t.id,
      ),
    ).toContain(ids.otherTicket);
    expect(
      (await supervisor.get(`/api/v1/tickets?assignedTo=${ids.technician}`)).body.data.map(
        (t: { id: string }) => t.id,
      ),
    ).toContain(ids.ownTicket);

    expect(
      (
        await technician
          .patch(`/api/v1/tickets/${ids.ownTicket}`)
          .set('X-CSRF-Token', techCsrf)
          .send({ assignedToUserId: ids.admin, expectedUpdatedAt: ticketVersion(ids.ownTicket) })
      ).status,
    ).toBe(403);
    expect(
      (
        await client.post('/api/v1/tickets').set('X-CSRF-Token', clientCsrf).send({
          customerId: ids.otherCustomer,
          categoryId: ids.category,
          title: 'Intento',
          description: 'Detalle',
          priority: 'alta',
        })
      ).status,
    ).toBe(404);
  });
  it('autoriza creación propia y resolución por técnico asignado', async () => {
    const created = await client.post('/api/v1/tickets').set('X-CSRF-Token', clientCsrf).send({
      customerId: ids.customer,
      categoryId: ids.category,
      title: 'Solicitud propia',
      description: 'Detalle',
      priority: 'media',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.createdByUserId).toBeUndefined();
    const assigned = await supervisor
      .post(`/api/v1/tickets/${created.body.data.id}/assignment`)
      .set('X-CSRF-Token', supervisorCsrf)
      .send({ technicianId: ids.technician, expectedUpdatedAt: created.body.data.updatedAt });
    expect(assigned.status).toBe(200);
    const staleStatus = await technician
      .patch(`/api/v1/tickets/${created.body.data.id}`)
      .set('X-CSRF-Token', techCsrf)
      .send({ status: 'en_proceso', expectedUpdatedAt: created.body.data.updatedAt });
    expect(staleStatus.status).toBe(409);
    expect(
      (
        await technician
          .patch(`/api/v1/tickets/${created.body.data.id}`)
          .set('X-CSRF-Token', techCsrf)
          .send({ status: 'en_proceso', expectedUpdatedAt: ticketVersion(created.body.data.id) })
      ).status,
    ).toBe(200);
    expect(
      (
        await technician
          .patch(`/api/v1/tickets/${created.body.data.id}`)
          .set('X-CSRF-Token', techCsrf)
          .send({
            status: 'resuelto',
            resolution: 'Equipo reparado',
            expectedUpdatedAt: ticketVersion(created.body.data.id),
          })
      ).status,
    ).toBe(200);
    const result = await client.get(`/api/v1/tickets/${created.body.data.id}`);
    expect(result.body.data.resolution).toBe('Equipo reparado');
    expect((await otherClient.get(`/api/v1/tickets/${created.body.data.id}`)).status).toBe(404);
    const report = await client.get('/api/v1/reports/summary');
    expect(report.body.data.total).toBe(2);
    expect(report.body.data.resolved).toBe(1);
    expect(report.body.data.workload).toEqual([]);
    expect(report.body.data.lowStock).toBeNull();
    expect((await otherClient.get('/api/v1/reports/summary')).body.data.total).toBe(1);
    expect(
      (await client.get('/api/v1/reports/summary?from=2099-01-01T00%3A00%3A00.000Z')).body.data
        .total,
    ).toBe(0);

    db.update(users).set({ status: 'inactivo' }).where(eq(users.id, ids.technician)).run();
    const inactive = await admin
      .patch(`/api/v1/tickets/${ids.ownTicket}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'en_proceso', expectedUpdatedAt: ticketVersion(ids.ownTicket) });
    expect(inactive.status).toBe(400);
    expect(inactive.body.error.code).toBe('INVALID_ASSIGNEE');
    db.update(users).set({ status: 'activo' }).where(eq(users.id, ids.technician)).run();
    const invalid = await technician
      .patch(`/api/v1/tickets/${ids.ownTicket}`)
      .set('X-CSRF-Token', techCsrf)
      .send({ status: 'resuelto', expectedUpdatedAt: ticketVersion(ids.ownTicket) });
    expect(invalid.status).toBe(400);
    expect(
      (
        await technician
          .patch(`/api/v1/tickets/${ids.ownTicket}`)
          .set('X-CSRF-Token', techCsrf)
          .send({ status: 'en_proceso', expectedUpdatedAt: ticketVersion(ids.ownTicket) })
      ).status,
    ).toBe(200);
    const resolved = await technician
      .patch(`/api/v1/tickets/${ids.ownTicket}`)
      .set('X-CSRF-Token', techCsrf)
      .send({
        status: 'resuelto',
        resolution: 'Se reinició el servicio.',
        expectedUpdatedAt: ticketVersion(ids.ownTicket),
      });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.resolution).toBe('Se reinició el servicio.');
  });
  it('protege comentarios internos y conserva texto como texto', async () => {
    const payload = '<script>alert(1)</script>';
    expect(
      (
        await technician
          .post(`/api/v1/tickets/${ids.ownTicket}/comments`)
          .set('X-CSRF-Token', techCsrf)
          .send({ body: 'Nota interna', visibility: 'interno', requestId: randomUUID() })
      ).status,
    ).toBe(201);
    expect(
      (
        await client
          .post(`/api/v1/tickets/${ids.ownTicket}/comments`)
          .set('X-CSRF-Token', clientCsrf)
          .send({ body: payload, visibility: 'interno', requestId: randomUUID() })
      ).status,
    ).toBe(403);
    expect(
      (
        await client
          .post(`/api/v1/tickets/${ids.ownTicket}/comments`)
          .set('X-CSRF-Token', clientCsrf)
          .send({ body: payload, visibility: 'cliente', requestId: randomUUID() })
      ).status,
    ).toBe(201);
    const result = await client.get(`/api/v1/tickets/${ids.ownTicket}/history`);
    expect(result.body.data.comments.map((c: { body: string }) => c.body)).toEqual([payload]);
    expect(
      result.body.data.events.some((e: { type: string }) => e.type === 'comentario_interno'),
    ).toBe(false);
    expect(
      result.body.data.events.some((e: { type: string }) => e.type === 'comentario_publico'),
    ).toBe(true);
    const recent = await client.get('/api/v1/reports/recent');
    expect(recent.status).toBe(200);
    expect(recent.body.data.some((e: { type: string }) => e.type === 'comentario_interno')).toBe(
      false,
    );
    expect(
      recent.body.data.every((e: { ticketId: string }) => e.ticketId !== ids.otherTicket),
    ).toBe(true);
  });
  it('exige transición válida, solución y motivo al reabrir', async () => {
    const bad = await admin
      .patch(`/api/v1/tickets/${ids.otherTicket}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'cerrado', expectedUpdatedAt: ticketVersion(ids.otherTicket) });
    expect(bad.status).toBe(409);
    const closed = await admin
      .patch(`/api/v1/tickets/${ids.ownTicket}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'cerrado', expectedUpdatedAt: ticketVersion(ids.ownTicket) });
    expect(closed.status).toBe(200);
    const missing = await admin
      .patch(`/api/v1/tickets/${ids.ownTicket}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'reabierto', expectedUpdatedAt: ticketVersion(ids.ownTicket) });
    expect(missing.status).toBe(400);
    const reopened = await admin
      .patch(`/api/v1/tickets/${ids.ownTicket}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        status: 'reabierto',
        reopenReason: 'La incidencia continúa',
        expectedUpdatedAt: ticketVersion(ids.ownTicket),
      });
    expect(reopened.status).toBe(200);
    const history = await admin.get(`/api/v1/tickets/${ids.ownTicket}/history`);
    expect(
      history.body.data.events.some((e: { detail: string }) =>
        e.detail.includes('La incidencia continúa'),
      ),
    ).toBe(true);
  });
  it('rechaza campos extra, orden inseguro y registros ajenos', async () => {
    expect((await client.get('/api/v1/tickets?sort=title%3BDELETE')).status).toBe(400);
    expect((await client.get('/api/v1/tickets?status=abierto&status=cerrado')).status).toBe(400);
    const injection = await client.get('/api/v1/tickets').query({ q: "%' OR 1=1 --" });
    expect(injection.status).toBe(200);
    expect(injection.body.data).toHaveLength(0);
    expect(
      (
        await client
          .patch('/api/v1/profile')
          .set('X-CSRF-Token', clientCsrf)
          .send({ fullName: 'Cliente', role: 'administrador' })
      ).status,
    ).toBe(400);
    expect(
      (
        await client.post('/api/v1/tickets').set('X-CSRF-Token', clientCsrf).send({
          customerId: ids.customer,
          categoryId: ids.category,
          title: 'Título',
          description: 'Detalle',
          priority: 'alta',
          createdByUserId: ids.admin,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client
          .patch(`/api/v1/users/${ids.admin}`)
          .set('X-CSRF-Token', clientCsrf)
          .send({ role: 'administrador' })
      ).status,
    ).toBe(403);
  });
  it('rechaza sesiones expiradas e inactivas', async () => {
    const temp = request.agent(app);
    await login(temp, 'tech@example.test');
    db.update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() })
      .where(eq(sessions.userId, ids.technician))
      .run();
    expect((await temp.get('/api/v1/auth/me')).status).toBe(401);
    await login(technician, 'tech@example.test').then((r) => {
      techCsrf = r.body.data.csrfToken;
    });
  });
  it('asigna de forma transaccional y protege notificaciones frente a reasignación', async () => {
    const target = await admin.get(`/api/v1/tickets/${ids.otherTicket}`);
    const original = target.body.data.updatedAt;
    const first = await supervisor
      .post(`/api/v1/tickets/${ids.otherTicket}/assignment`)
      .set('X-CSRF-Token', supervisorCsrf)
      .send({ technicianId: ids.technician, expectedUpdatedAt: original });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('asignado');
    const stale = await supervisor
      .post(`/api/v1/tickets/${ids.otherTicket}/assignment`)
      .set('X-CSRF-Token', supervisorCsrf)
      .send({ technicianId: ids.technician, expectedUpdatedAt: original });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_TICKET');
    const inbox = await technician.get('/api/v1/notifications');
    const assigned = inbox.body.data.filter(
      (n: { ticketId: string }) => n.ticketId === ids.otherTicket,
    );
    expect(assigned).toHaveLength(1);
    const notificationId = assigned[0].id;
    expect((await technician.get(`/api/v1/notifications/${notificationId}`)).status).toBe(200);
    expect((await client.get(`/api/v1/notifications/${notificationId}`)).status).toBe(404);
    expect(
      (
        await client
          .post('/api/v1/notifications/read')
          .set('X-CSRF-Token', clientCsrf)
          .send({ ids: [notificationId] })
      ).status,
    ).toBe(404);
    expect(
      (
        await technician
          .post('/api/v1/notifications/read')
          .set('X-CSRF-Token', techCsrf)
          .send({ ids: [notificationId] })
      ).status,
    ).toBe(204);
    const secondId = randomUUID(),
      source = db.select().from(users).where(eq(users.id, ids.technician)).get()!;
    db.insert(users)
      .values({ ...source, id: secondId, email: 'tech2@example.test' })
      .run();
    const noReason = await supervisor
      .post(`/api/v1/tickets/${ids.otherTicket}/assignment`)
      .set('X-CSRF-Token', supervisorCsrf)
      .send({ technicianId: secondId, expectedUpdatedAt: first.body.data.updatedAt });
    expect(noReason.status).toBe(400);
    const reassigned = await supervisor
      .post(`/api/v1/tickets/${ids.otherTicket}/assignment`)
      .set('X-CSRF-Token', supervisorCsrf)
      .send({
        technicianId: secondId,
        expectedUpdatedAt: first.body.data.updatedAt,
        reason: 'Cambio de turno',
      });
    expect(reassigned.status).toBe(200);
    expect(
      (await technician.get('/api/v1/notifications')).body.data.filter(
        (n: { ticketId: string }) => n.ticketId === ids.otherTicket,
      ),
    ).toHaveLength(0);
    const history = await supervisor.get(`/api/v1/tickets/${ids.otherTicket}/assignments`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(2);
    const second = request.agent(app);
    await login(second, 'tech2@example.test');
    expect((await second.get('/api/v1/notifications')).body.data).toHaveLength(1);
  });
  it('rechaza caducidad absoluta y peticiones demasiado grandes', async () => {
    const temporary = request.agent(app);
    await login(temporary, 'tech@example.test');
    const current = (await temporary.get('/api/v1/auth/sessions')).body.data.find(
      (session: { current: boolean }) => session.current,
    );
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(sessions.id, current.id))
      .run();
    expect((await temporary.get('/api/v1/auth/me')).status).toBe(401);
    expect((await temporary.post('/api/v1/auth/logout').set('X-CSRF-Token', techCsrf)).status).toBe(
      401,
    );
    const large = await admin
      .post('/api/v1/customers')
      .set('X-CSRF-Token', adminCsrf)
      .send({ name: 'a'.repeat(40000) });
    expect(large.status).toBe(413);
    expect(large.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(JSON.stringify(large.body)).not.toContain('stack');
  });
  it('revoca una sesión propia y rechaza identificadores de otras cuentas', async () => {
    const list = await secondAdmin.get('/api/v1/auth/sessions');
    const target = list.body.data.find((item: { current: boolean }) => item.current).id;
    expect(
      (
        await client
          .post(`/api/v1/auth/sessions/${target}/revoke`)
          .set('X-CSRF-Token', clientCsrf)
          .send({ password })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`/api/v1/auth/sessions/${target}/revoke`)
          .set('X-CSRF-Token', adminCsrf)
          .send({ password })
      ).status,
    ).toBe(204);
    expect((await secondAdmin.get('/api/v1/auth/me')).status).toBe(401);
    secondCsrf = (await login(secondAdmin, 'admin@example.test')).body.data.csrfToken;
  });
  it('cambia contraseña y revoca otras sesiones', async () => {
    expect(
      (
        await admin
          .post('/api/v1/auth/password')
          .set('X-CSRF-Token', adminCsrf)
          .send({ currentPassword: 'incorrecto', newPassword: 'nueva-clave-prueba-123' })
      ).status,
    ).toBe(401);
    expect(
      (
        await admin
          .post('/api/v1/auth/password')
          .set('X-CSRF-Token', adminCsrf)
          .send({ currentPassword: password, newPassword: 'nueva-clave-prueba-123' })
      ).status,
    ).toBe(204);
    expect((await secondAdmin.get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (await secondAdmin.post('/api/v1/auth/logout').set('X-CSRF-Token', secondCsrf)).status,
    ).toBe(401);
  });
  it('recupera contraseña con token de un uso y caducidad', async () => {
    const a = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'client@example.test' });
    const b = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'none@example.test' });
    expect(a.status).toBe(202);
    expect(a.body).toEqual(b.body);
    let files: string[] = [];
    let token: string | undefined;
    for (let i = 0; i < 40; i++) {
      try {
        files = readdirSync(join(dir, 'mail'));
        if (files.length === 1)
          token = readFileSync(join(dir, 'mail', files[0]), 'utf8').match(
            /#([A-Za-z0-9_-]{43})/,
          )?.[1];
        if (token) break;
      } catch {
        // El buzón y su contenido pueden aparecer de forma asíncrona.
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(files.length).toBe(1);
    expect(token).toBeTruthy();
    const saved = sqlite
      .prepare(
        'SELECT token_hash FROM password_resets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(ids.client) as { token_hash: string };
    expect(saved.token_hash).not.toBe(token);
    expect((await request(app).post('/api/v1/auth/validate-reset').send({ token })).status).toBe(
      204,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token, newPassword: 'clave-restablecida-123' })
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token, newPassword: 'otra-clave-12345' })
      ).status,
    ).toBe(400);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    expect((await login(client, 'client@example.test', 'clave-restablecida-123')).status).toBe(200);
  });
  it('rechaza enlaces caducados, asignaciones ajenas y usuarios desactivados', async () => {
    const expired = randomToken();
    const date = new Date(Date.now() - 3600000).toISOString();
    db.insert(passwordResets)
      .values({
        id: randomUUID(),
        userId: ids.other,
        tokenHash: digest(expired),
        createdAt: date,
        expiresAt: date,
      })
      .run();
    expect(
      (await request(app).post('/api/v1/auth/validate-reset').send({ token: expired })).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: expired, newPassword: 'nueva-clave-prueba-123' })
      ).status,
    ).toBe(400);
    db.update(users).set({ status: 'inactivo' }).where(eq(users.id, ids.other)).run();
    expect((await otherClient.get('/api/v1/auth/me')).status).toBe(401);
    const audit = await admin.get('/api/v1/audit');
    expect(audit.status).toBe(200);
    expect(
      audit.body.data.security.some(
        (entry: { action: string; outcome: string }) =>
          entry.action === 'auth.login' && entry.outcome === 'failure',
      ),
    ).toBe(true);
    expect(JSON.stringify(audit.body)).not.toContain(password);

    expect((await supervisor.get('/api/v1/audit')).status).toBe(403);
  });
  it('limita fuerza bruta sin revelar existencia', async () => {
    for (let i = 0; i < 10; i++)
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .send({ email: 'none@example.test', password: 'incorrecta' });
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'none@example.test', password: 'incorrecta' })
      ).status,
    ).toBe(429);
  });
});
