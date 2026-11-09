import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase } from './db.js';
import { users } from './schema.js';
import { createApp } from './app.js';
import { Domain } from './domain.js';
import { createRequire } from 'node:module';
const dir = mkdtempSync(join(tmpdir(), 'opsdesk-test-'));
const path = join(dir, 'test.db');
const connection = openDatabase(path);
const { db, sqlite } = connection;
migrate(db, { migrationsFolder: './drizzle' });
const app = createApp(db, { attachmentDir: join(dir, 'attachments') });
const admin = request.agent(app);
const limited = request.agent(app);
let csrf = '';
let limitedCsrf = '';
let customer = '';
let category = '';
let ticket = '';
beforeAll(async () => {
  const date = new Date().toISOString();
  const passwordHash = await argon2.hash('contraseña-segura-123', { type: argon2.argon2id });
  db.insert(users)
    .values([
      {
        id: randomUUID(),
        fullName: 'Admin Test',
        email: 'admin@example.test',
        passwordHash,
        role: 'administrador',
        status: 'activo',
        createdAt: date,
        updatedAt: date,
      },
      {
        id: randomUUID(),
        fullName: 'Técnico Test',
        email: 'tech@example.test',
        passwordHash,
        role: 'tecnico',
        status: 'activo',
        createdAt: date,
        updatedAt: date,
      },
    ])
    .run();
});
afterAll(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});
describe('API persistente', () => {
  it('salud y rutas protegidas', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get('/api/v1/ready')).body).toEqual({
      status: 'ready',
      database: 'ok',
    });
    const uninitialized = openDatabase(':memory:');
    try {
      const response = await request(createApp(uninitialized.db)).get('/api/v1/ready');
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain('sqlite');
    } finally {
      uninitialized.sqlite.close();
    }

    expect((await request(app).get('/api/v1/customers')).status).toBe(401);
  });
  it('registra duración sin incluir consultas, contraseñas ni cookies', async () => {
    const entries: object[] = [];
    const loggingApp = createApp(db, { onRequestLog: (entry) => entries.push(entry) });
    const response = await request(loggingApp)
      .post('/api/v1/auth/login?token=secreto-en-consulta')
      .set('Cookie', 'opsdesk_session=secreto-en-cookie')
      .send({ email: 'nadie@example.test', password: 'secreto-en-cuerpo' });
    expect(response.status).toBe(401);
    expect(entries).toHaveLength(1);
    const text = JSON.stringify(entries);
    expect(text).not.toContain('secreto');
    expect(text).not.toContain('nadie@example.test');
    expect(entries[0]).toMatchObject({ method: 'POST', resource: 'auth', status: 401 });
  });
  it('autentica y restringe roles', async () => {
    expect(
      (
        await admin
          .post('/api/v1/auth/login')
          .send({ email: 'admin@example.test', password: 'incorrecta' })
      ).status,
    ).toBe(401);
    const r = await admin
      .post('/api/v1/auth/login')
      .send({ email: 'ADMIN@example.test', password: 'contraseña-segura-123' });
    expect(r.status).toBe(200);
    expect(r.body.data.user.passwordHash).toBeUndefined();
    csrf = r.body.data.csrfToken;
    const techLogin = await limited
      .post('/api/v1/auth/login')
      .send({ email: 'tech@example.test', password: 'contraseña-segura-123' });
    limitedCsrf = techLogin.body.data.csrfToken;
    expect((await limited.get('/api/v1/customers')).status).toBe(403);
  });
  it('exige CSRF y valida entradas', async () => {
    expect((await admin.post('/api/v1/customers').send({ name: 'Empresa' })).status).toBe(403);
    expect(
      (await admin.post('/api/v1/customers').set('X-CSRF-Token', csrf).send({ name: '' })).status,
    ).toBe(400);
  });
  it('crea y busca clientes, evita documentos duplicados', async () => {
    const input = { name: 'Empresa Ejemplo', documentType: 'NIT', documentNumber: '123' };
    const r = await admin.post('/api/v1/customers').set('X-CSRF-Token', csrf).send(input);
    expect(r.status).toBe(201);
    customer = r.body.data.id;
    expect(
      (await admin.post('/api/v1/customers').set('X-CSRF-Token', csrf).send(input)).status,
    ).toBe(409);
    const list = await admin.get('/api/v1/customers?q=Ejemplo&limit=1&sort=name');
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(customer);
    expect((await admin.get('/api/v1/customers?limit=101')).status).toBe(400);
    expect((await admin.get('/api/v1/customers?sort=unsafe')).status).toBe(400);
  });
  it('detecta ediciones obsoletas de clientes sin sobrescribir cambios', async () => {
    const original = await admin.get(`/api/v1/customers/${customer}`);
    const version = original.body.data.updatedAt;
    const first = await admin
      .patch(`/api/v1/customers/${customer}`)
      .set('X-CSRF-Token', csrf)
      .send({ phone: '555-0101', status: 'inactivo', expectedUpdatedAt: version });
    expect(first.status).toBe(200);
    expect(first.body.data.updatedAt).not.toBe(version);
    const stale = await admin
      .patch(`/api/v1/customers/${customer}`)
      .set('X-CSRF-Token', csrf)
      .send({ phone: '555-9999', expectedUpdatedAt: version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_CUSTOMER');
    expect((await admin.get(`/api/v1/customers/${customer}`)).body.data.phone).toBe('555-0101');
    const partial = await admin
      .patch(`/api/v1/customers/${customer}`)
      .set('X-CSRF-Token', csrf)
      .send({ phone: '555-0102', expectedUpdatedAt: first.body.data.updatedAt });
    expect(partial.status).toBe(200);
    expect(partial.body.data.status).toBe('inactivo');
    expect(
      (
        await admin
          .patch(`/api/v1/customers/${customer}`)
          .set('X-CSRF-Token', csrf)
          .send({ expectedUpdatedAt: first.body.data.updatedAt })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin
          .patch(`/api/v1/customers/${customer}`)
          .set('X-CSRF-Token', csrf)
          .send({ status: 'activo', expectedUpdatedAt: partial.body.data.updatedAt })
      ).status,
    ).toBe(200);
  });
  it('conserva integridad y genera historial de ticket', async () => {
    const c = await admin
      .post('/api/v1/categories')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Soporte' });
    category = c.body.data.id;
    const bad = await admin.post('/api/v1/tickets').set('X-CSRF-Token', csrf).send({
      customerId: randomUUID(),
      categoryId: category,
      title: 'Ayuda',
      description: 'Detalle',
      priority: 'alta',
    });
    expect(bad.status).toBe(400);
    const created = await admin.post('/api/v1/tickets').set('X-CSRF-Token', csrf).send({
      customerId: customer,
      categoryId: category,
      title: 'Ayuda',
      description: 'Detalle',
      priority: 'alta',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.ticketNumber).toBe(1);
    ticket = created.body.data.id;
    expect(
      (
        await admin
          .post(`/api/v1/tickets/${ticket}/comments`)
          .set('X-CSRF-Token', csrf)
          .send({ body: 'Revisando', visibility: 'interno', requestId: randomUUID() })
      ).status,
    ).toBe(201);
    const history = await admin.get(`/api/v1/tickets/${ticket}/history`);
    expect(history.body.data.events).toHaveLength(2);
    expect(history.body.data.comments).toHaveLength(1);
    const actions = sqlite
      .prepare('SELECT action FROM audit_logs ORDER BY rowid')
      .all()
      .map((entry) => (entry as { action: string }).action);
    expect(actions).toContain('customer.created');
    expect(actions).toContain('category.created');
    expect(actions).toContain('ticket.created');
    expect(actions).toContain('comment.created');
    expect(
      (await admin.post(`/api/v1/tickets/${ticket}/archive`).set('X-CSRF-Token', csrf)).status,
    ).toBe(409);
  });
  it('documenta la API solo para administrador y devuelve errores trazables', async () => {
    expect((await request(app).get('/api/v1/openapi.json')).status).toBe(401);
    const spec = await admin.get('/api/v1/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect((await admin.get('/api/v1/docs/')).status).toBe(200);
    const invalid = await admin.get('/api/v1/tickets?priority=imposible');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.requestId).toBe(invalid.headers['x-request-id']);
  });
  it('rechaza duplicados y no filtra hashes', async () => {
    const r = await admin.post('/api/v1/users').set('X-CSRF-Token', csrf).send({
      fullName: 'Otra cuenta',
      email: 'ADMIN@example.test',
      password: 'otra-contraseña-segura',
      role: 'tecnico',
    });
    expect(r.status).toBe(409);
    const list = await admin.get('/api/v1/users?sort=email&order=desc&limit=1');
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0].passwordHash).toBeUndefined();
  });
  it('exige el endpoint de asignación sin modificar el ticket', async () => {
    const current = await admin.get(`/api/v1/tickets/${ticket}`);
    const withoutVersion = await admin
      .patch(`/api/v1/tickets/${ticket}`)
      .set('X-CSRF-Token', csrf)
      .send({ priority: 'alta' });
    expect(withoutVersion.status).toBe(400);
    const r = await admin.patch(`/api/v1/tickets/${ticket}`).set('X-CSRF-Token', csrf).send({
      assignedToUserId: randomUUID(),
      expectedUpdatedAt: current.body.data.updatedAt,
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('USE_ASSIGNMENT_ENDPOINT');
    const after = await admin.get(`/api/v1/tickets/${ticket}`);
    expect(after.body.data.assignedToUserId).toBeNull();
    const h = await admin.get(`/api/v1/tickets/${ticket}/history`);
    expect(h.body.data.events).toHaveLength(2);
  });
  it('valida respuestas reales contra los esquemas OpenAPI publicados', async () => {
    const require = createRequire(import.meta.url);
    const Ajv2020 = require('ajv/dist/2020').default;
    const addFormats = require('ajv-formats').default;
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const spec = (await admin.get('/api/v1/openapi.json')).body;
    const samples = [
      { path: '/users', url: '/api/v1/users' },
      { path: '/customers', url: '/api/v1/customers' },
      { path: '/tickets', url: '/api/v1/tickets' },
      { path: '/tickets/{id}', url: `/api/v1/tickets/${ticket}` },
      { path: '/tickets/{id}/history', url: `/api/v1/tickets/${ticket}/history` },
    ];
    for (const sample of samples) {
      const response = await admin.get(sample.url);
      expect(response.status).toBe(200);
      const validate = ajv.compile(
        spec.paths[sample.path].get.responses['200'].content['application/json'].schema,
      );
      expect(validate(response.body), JSON.stringify(validate.errors)).toBe(true);
    }
  });
  it('audita los cambios de usuarios sin guardar credenciales', async () => {
    const created = await admin.post('/api/v1/users').set('X-CSRF-Token', csrf).send({
      fullName: 'Cuenta Auditada',
      email: 'auditoria@example.test',
      password: 'contraseña-segura-456',
      role: 'tecnico',
    });
    expect(created.status).toBe(201);
    const updated = await admin
      .patch(`/api/v1/users/${created.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'inactivo' });
    expect(updated.status).toBe(200);
    const entries = sqlite
      .prepare('SELECT action, resource_id FROM audit_logs WHERE resource_id = ? ORDER BY rowid')
      .all(created.body.data.id);
    expect(entries).toEqual([
      { action: 'user.created', resource_id: created.body.data.id },
      { action: 'user.deactivated', resource_id: created.body.data.id },
      { action: 'user.updated', resource_id: created.body.data.id },
    ]);
    expect(JSON.stringify(entries)).not.toContain('contraseña');
  });
  it('revierte número y ticket si falla la escritura transaccional', () => {
    const service = new Domain(db);
    expect(() =>
      service.createTicket(
        {
          customerId: customer,
          categoryId: category,
          title: 'Fallo',
          description: 'Prueba',
          priority: 'alta',
        },
        randomUUID(),
      ),
    ).toThrow();
    expect(sqlite.prepare('SELECT value FROM counters WHERE name = ?').get('ticket')).toEqual({
      value: 1,
    });
    expect(sqlite.prepare('SELECT count(*) AS n FROM tickets').get()).toEqual({ n: 1 });
  });
  it('mantiene claves foráneas y persiste al reabrir', () => {
    expect(() => sqlite.prepare('DELETE FROM customers WHERE id=?').run(customer)).toThrow();
    const second = openDatabase(path);
    expect(second.sqlite.prepare('SELECT count(*) AS n FROM tickets').get()).toEqual({ n: 1 });
    second.sqlite.close();
  });
  it('registra inventario atómicamente y evita consumos duplicados', async () => {
    const post = (path: string, value: object) =>
      admin.post(`/api/v1/inventory/${path}`).set('X-CSRF-Token', csrf).send(value);
    const product = await post('products', { name: 'Conector', unit: 'unidad', minimum: 2 });
    const a = await post('locations', { name: 'Depósito A' });
    const b = await post('locations', { name: 'Depósito B' });
    expect([product.status, a.status, b.status]).toEqual([201, 201, 201]);
    const entry = {
      requestId: randomUUID(),
      productId: product.body.data.id,
      kind: 'entrada',
      destinationId: a.body.data.id,
      quantity: 5,
      reason: 'Compra',
    };
    expect((await post('movements', entry)).status).toBe(201);
    expect((await post('movements', entry)).status).toBe(200);
    expect((await post('movements', { ...entry, quantity: 6 })).status).toBe(409);
    const transfer = {
      requestId: randomUUID(),
      productId: entry.productId,
      kind: 'transferencia',
      sourceId: a.body.data.id,
      destinationId: b.body.data.id,
      quantity: 3,
      reason: 'Traslado',
    };
    expect((await post('movements', transfer)).status).toBe(201);
    expect(
      (await post('movements', { ...transfer, requestId: randomUUID(), quantity: 8 })).status,
    ).toBe(409);
    const consumption = {
      requestId: randomUUID(),
      productId: entry.productId,
      kind: 'salida',
      sourceId: b.body.data.id,
      ticketId: ticket,
      quantity: 2,
      reason: 'Reparación',
    };
    expect((await post('movements', consumption)).status).toBe(201);
    expect((await post('movements', consumption)).status).toBe(200);
    const stock = await admin.get('/api/v1/inventory/stock');
    expect(stock.body.data.map((x: { quantity: number }) => x.quantity).sort()).toEqual([1, 2]);
    const firstPage = await admin.get('/api/v1/inventory/stock?limit=1&page=1');
    const secondPage = await admin.get('/api/v1/inventory/stock?limit=1&page=2');
    expect(firstPage.body.meta.total).toBe(2);
    expect(secondPage.body.data[0].id).not.toBe(firstPage.body.data[0].id);
    expect(
      (await admin.get(`/api/v1/inventory/movements?productId=${entry.productId}&limit=1`)).body
        .meta.total,
    ).toBe(3);

    const simultaneous = await Promise.all([
      post('movements', {
        ...transfer,
        requestId: randomUUID(),
        kind: 'salida',
        destinationId: undefined,
        quantity: 2,
      }),
      post('movements', {
        ...transfer,
        requestId: randomUUID(),
        kind: 'salida',
        destinationId: undefined,
        quantity: 2,
      }),
    ]);
    expect(simultaneous.map((x) => x.status).sort()).toEqual([201, 409]);
    const snapshotBefore = sqlite
      .prepare('SELECT quantity FROM inventory_stock WHERE product_id=? AND location_id=?')
      .get(entry.productId, b.body.data.id);
    const movementCount = sqlite.prepare('SELECT count(*) AS n FROM inventory_movements').get();
    sqlite.exec(
      "CREATE TRIGGER fail_movement BEFORE INSERT ON audit_logs WHEN NEW.action = 'inventory.movement' BEGIN SELECT RAISE(FAIL, 'forced'); END",
    );
    const failed = await post('movements', {
      requestId: randomUUID(),
      productId: entry.productId,
      kind: 'salida',
      sourceId: b.body.data.id,
      quantity: 1,
      reason: 'Fallo forzado',
    });
    expect(failed.status).toBe(409);
    sqlite.exec('DROP TRIGGER fail_movement');
    expect(
      sqlite
        .prepare('SELECT quantity FROM inventory_stock WHERE product_id=? AND location_id=?')
        .get(entry.productId, b.body.data.id),
    ).toEqual(snapshotBefore);
    expect(sqlite.prepare('SELECT count(*) AS n FROM inventory_movements').get()).toEqual(
      movementCount,
    );
    const low = await admin.get('/api/v1/inventory/low-stock');
    expect(low.body.data).toHaveLength(1);
    expect(low.body.data[0].quantity).toBe(1);
    const alerts = await admin.get('/api/v1/inventory/alerts');
    expect(alerts.body.data).toHaveLength(2);
    expect((await limited.get('/api/v1/inventory/alerts')).status).toBe(403);
    expect(
      (
        await admin
          .post('/api/v1/inventory/alerts/read')
          .set('X-CSRF-Token', csrf)
          .send({ ids: [alerts.body.data[0].id] })
      ).status,
    ).toBe(204);
    const updated = await admin
      .patch(`/api/v1/inventory/products/${entry.productId}`)
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Conector ajustado',
        minimum: 1,
        expectedUpdatedAt: product.body.data.updatedAt,
      });
    expect(updated.status).toBe(200);
    expect(
      (
        await admin
          .patch(`/api/v1/inventory/products/${entry.productId}`)
          .set('X-CSRF-Token', csrf)
          .send({ minimum: 9, expectedUpdatedAt: product.body.data.updatedAt })
      ).status,
    ).toBe(409);
    expect((await admin.get('/api/v1/inventory/low-stock')).body.data).toHaveLength(0);
    const adjustment = {
      requestId: randomUUID(),
      productId: entry.productId,
      kind: 'ajuste_entrada',
      destinationId: a.body.data.id,
      quantity: 2,
      reason: 'Conteo físico',
    };
    expect((await post('movements', adjustment)).status).toBe(201);
    expect((await post('movements', adjustment)).status).toBe(200);
    const correction = {
      requestId: randomUUID(),
      productId: entry.productId,
      kind: 'ajuste_salida',
      sourceId: a.body.data.id,
      quantity: 2,
      reason: 'Corrección',
    };
    expect((await post('movements', correction)).status).toBe(201);
    expect(
      (
        await limited
          .post('/api/v1/inventory/movements')
          .set('X-CSRF-Token', limitedCsrf)
          .send(adjustment)
      ).status,
    ).toBe(403);
    expect(
      sqlite
        .prepare("SELECT count(*) AS n FROM audit_logs WHERE action='inventory.adjustment'")
        .get(),
    ).toEqual({ n: 2 });

    expect((await admin.get('/api/v1/inventory/products?q=ajustado')).body.data).toHaveLength(1);
    expect(
      (
        await limited
          .patch(`/api/v1/inventory/products/${entry.productId}`)
          .set('X-CSRF-Token', limitedCsrf)
          .send({ minimum: 3 })
      ).status,
    ).toBe(403);
    const history = await admin.get(`/api/v1/tickets/${ticket}/history`);
    expect(
      history.body.data.events.filter((x: { type: string }) => x.type === 'material_consumido'),
    ).toHaveLength(1);
    expect(
      (
        await limited
          .post('/api/v1/inventory/movements')
          .set('X-CSRF-Token', limitedCsrf)
          .send(entry)
      ).status,
    ).toBe(403);
  });
  it('gestiona tareas con permisos, historial y control de versión', async () => {
    const tech = sqlite
      .prepare('SELECT id FROM users WHERE email = ?')
      .get('tech@example.test') as { id: string };
    const created = await admin.post('/api/v1/tasks').set('X-CSRF-Token', csrf).send({
      title: 'Preparar equipo',
      description: 'Comprobar materiales',
      assigneeId: tech.id,
      priority: 'alta',
      dueAt: '2020-01-01T00:00:00.000Z',
      ticketId: null,
    });
    expect(created.status).toBe(201);
    const row = created.body.data;
    const firstPage = await limited.get('/api/v1/tasks?limit=1&page=1');
    expect(firstPage.body.meta.total).toBe(1);
    expect((await limited.get('/api/v1/tasks?limit=1&page=2')).body.data).toHaveLength(0);
    const taskNotices = await limited.get('/api/v1/tasks/notifications');
    expect(taskNotices.status).toBe(200);
    expect(taskNotices.body.data).toHaveLength(2);
    expect((await limited.get('/api/v1/tasks/notifications')).body.data).toHaveLength(2);
    expect(
      (
        await admin
          .post('/api/v1/tasks/notifications/read')
          .set('X-CSRF-Token', csrf)
          .send({ ids: [taskNotices.body.data[0].id] })
      ).status,
    ).toBe(404);
    expect(
      (
        await limited
          .post('/api/v1/tasks/notifications/read')
          .set('X-CSRF-Token', limitedCsrf)
          .send({ ids: [taskNotices.body.data[0].id] })
      ).status,
    ).toBe(204);
    expect(
      (await limited.get('/api/v1/tasks?overdue=true')).body.data.map((x: { id: string }) => x.id),
    ).toContain(row.id);
    expect(
      (
        await limited
          .patch(`/api/v1/tasks/${row.id}`)
          .set('X-CSRF-Token', limitedCsrf)
          .send({ expectedUpdatedAt: row.updatedAt, title: 'No autorizado' })
      ).status,
    ).toBe(403);
    const started = await limited
      .patch(`/api/v1/tasks/${row.id}`)
      .set('X-CSRF-Token', limitedCsrf)
      .send({ expectedUpdatedAt: row.updatedAt, status: 'en_proceso' });
    expect(started.status).toBe(200);
    expect(
      (
        await limited
          .patch(`/api/v1/tasks/${row.id}`)
          .set('X-CSRF-Token', limitedCsrf)
          .send({ expectedUpdatedAt: row.updatedAt, status: 'completada' })
      ).status,
    ).toBe(409);
    const rescheduled = await admin
      .patch(`/api/v1/tasks/${row.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ expectedUpdatedAt: started.body.data.updatedAt, dueAt: '2021-01-01T00:00:00.000Z' });
    expect(rescheduled.status).toBe(200);
    expect((await limited.get('/api/v1/tasks/notifications')).body.data).toHaveLength(3);
    expect((await limited.get('/api/v1/tasks/notifications')).body.data).toHaveLength(3);
    const completed = await limited
      .patch(`/api/v1/tasks/${row.id}`)
      .set('X-CSRF-Token', limitedCsrf)
      .send({ expectedUpdatedAt: rescheduled.body.data.updatedAt, status: 'completada' });
    expect(completed.status).toBe(200);
    expect(completed.body.data.completedAt).toBeTruthy();
    const history = await limited.get(`/api/v1/tasks/${row.id}/history`);
    expect(history.body.data).toHaveLength(4);
    expect((await limited.get('/api/v1/tasks?overdue=true')).body.data).toHaveLength(0);
  });
  it('calcula indicadores reales y protege la exportación CSV', async () => {
    const before = sqlite.prepare('SELECT title FROM tickets WHERE id = ?').get(ticket) as {
      title: string;
    };
    sqlite.prepare('UPDATE tickets SET title = ? WHERE id = ?').run('=1+1', ticket);
    const summary = await admin.get('/api/v1/reports/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data.total).toBe(1);
    const csv = await admin.post('/api/v1/reports/tickets.csv').set('X-CSRF-Token', csrf).send({});
    expect(csv.status).toBe(200);
    expect(csv.text).toContain(`"'=1+1"`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(
      (await limited.post('/api/v1/reports/tickets.csv').set('X-CSRF-Token', limitedCsrf).send({}))
        .status,
    ).toBe(403);
    expect(
      sqlite
        .prepare('SELECT count(*) AS n FROM audit_logs WHERE action = ?')
        .get('report.tickets_exported'),
    ).toEqual({ n: 1 });
    sqlite.prepare('UPDATE tickets SET title = ? WHERE id = ?').run(before.title, ticket);
  });
  it('protege adjuntos y revierte archivos ante fallos de escritura', async () => {
    const path = `/api/v1/tickets/${ticket}/attachments`;
    const pdf = Buffer.from('%PDF-1.4\nexample\n%%EOF');
    const upload = (name: string, body: Buffer) =>
      admin
        .post(`${path}?name=${encodeURIComponent(name)}`)
        .set('X-CSRF-Token', csrf)
        .set('Content-Type', 'application/octet-stream')
        .send(body);
    expect((await upload('../escape.pdf', pdf)).status).toBe(400);
    expect((await upload('falso.png', pdf)).status).toBe(400);
    const created = await upload('evidencia.pdf', pdf);
    expect(created.status).toBe(201);
    expect((await limited.get(path)).status).toBe(404);
    const downloaded = await admin.get(`${path}/${created.body.data.id}`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-disposition']).toContain('attachment');
    expect(downloaded.body.equals(pdf)).toBe(true);
    sqlite.exec(
      "CREATE TRIGGER fail_attachment BEFORE INSERT ON audit_logs WHEN NEW.action = 'attachment.created' BEGIN SELECT RAISE(FAIL, 'forced'); END",
    );
    expect((await upload('otra.pdf', pdf)).status).toBe(409);
    sqlite.exec('DROP TRIGGER fail_attachment');
    expect(readdirSync(join(dir, 'attachments'))).toHaveLength(1);
    expect((await admin.get(path)).body.data).toHaveLength(1);
  });
  it('registra equipos identificables y conserva historial de asignación y devolución', async () => {
    const technician = sqlite
      .prepare('SELECT id FROM users WHERE email=?')
      .get('tech@example.test') as { id: string };
    const place = sqlite.prepare('SELECT id FROM inventory_locations LIMIT 1').get() as {
      id: string;
    };
    const make = () =>
      admin
        .post('/api/v1/inventory/assets')
        .set('X-CSRF-Token', csrf)
        .send({ name: 'Portátil', serial: 'SERIE-123', locationId: place.id });
    const created = await make();
    expect(created.status).toBe(201);
    expect((await make()).status).toBe(409);
    const asset = created.body.data;
    const assigned = await admin
      .post(`/api/v1/inventory/assets/${asset.id}/assignment`)
      .set('X-CSRF-Token', csrf)
      .send({
        assigneeId: technician.id,
        ticketId: null,
        locationId: place.id,
        expectedUpdatedAt: asset.updatedAt,
        reason: 'Entrega',
      });
    expect(assigned.status).toBe(200);
    expect((await limited.get('/api/v1/inventory/assets')).body.data).toHaveLength(1);
    const old = await admin
      .post(`/api/v1/inventory/assets/${asset.id}/assignment`)
      .set('X-CSRF-Token', csrf)
      .send({
        assigneeId: null,
        ticketId: null,
        locationId: place.id,
        expectedUpdatedAt: asset.updatedAt,
        reason: 'Retorno',
      });
    expect(old.status).toBe(409);
    const returned = await limited
      .post(`/api/v1/inventory/assets/${asset.id}/assignment`)
      .set('X-CSRF-Token', limitedCsrf)
      .send({
        assigneeId: null,
        ticketId: null,
        locationId: place.id,
        expectedUpdatedAt: assigned.body.data.updatedAt,
        reason: 'Retorno',
      });
    expect(returned.status).toBe(200);
    expect(
      (await admin.get(`/api/v1/inventory/assets/${asset.id}/history`)).body.data,
    ).toHaveLength(3);
    expect((await limited.get(`/api/v1/inventory/assets/${asset.id}/history`)).status).toBe(404);
  });
  it('no duplica comentarios ante reintentos con la misma clave', async () => {
    const input = { body: 'Información adicional', visibility: 'cliente', requestId: randomUUID() };
    const post = (body: object) =>
      admin.post(`/api/v1/tickets/${ticket}/comments`).set('X-CSRF-Token', csrf).send(body);
    const first = await post(input),
      retry = await post(input);
    expect(first.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect((await post({ ...input, body: 'Contenido diferente' })).status).toBe(409);
    const history = await admin.get(`/api/v1/tickets/${ticket}/history`);
    expect(
      history.body.data.comments.filter((x: { body: string }) => x.body === input.body),
    ).toHaveLength(1);
  });
  it('revoca sesión al salir', async () => {
    expect((await admin.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf)).status).toBe(204);
    expect((await admin.get('/api/v1/auth/me')).status).toBe(401);
  });
});
