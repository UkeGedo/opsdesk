import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { categories, customers, users } from './schema.js';

const { db, sqlite } = openDatabase(':memory:');
migrate(db, { migrationsFolder: './drizzle' });
const app = createApp(db),
  admin = request.agent(app),
  tech = request.agent(app);
const adminId = randomUUID(),
  techId = randomUUID(),
  customerId = randomUUID(),
  categoryId = randomUUID();
let adminCsrf = '',
  techCsrf = '';
beforeAll(async () => {
  const date = new Date().toISOString(),
    passwordHash = await argon2.hash('contraseña-segura-123');
  db.insert(users)
    .values([
      {
        id: adminId,
        fullName: 'Admin',
        email: 'admin-sla@example.test',
        passwordHash,
        role: 'administrador',
        status: 'activo',
        createdAt: date,
        updatedAt: date,
      },
      {
        id: techId,
        fullName: 'Técnico',
        email: 'tech-sla@example.test',
        passwordHash,
        role: 'tecnico',
        status: 'activo',
        createdAt: date,
        updatedAt: date,
      },
    ])
    .run();
  db.insert(customers)
    .values({
      id: customerId,
      name: 'Cliente SLA',
      status: 'activo',
      createdAt: date,
      updatedAt: date,
    })
    .run();
  db.insert(categories).values({ id: categoryId, name: 'Soporte SLA', active: true }).run();
  adminCsrf = (
    await admin
      .post('/api/v1/auth/login')
      .send({ email: 'admin-sla@example.test', password: 'contraseña-segura-123' })
  ).body.data.csrfToken;
  techCsrf = (
    await tech
      .post('/api/v1/auth/login')
      .send({ email: 'tech-sla@example.test', password: 'contraseña-segura-123' })
  ).body.data.csrfToken;
});
afterAll(() => sqlite.close());

describe('SLA integrado', () => {
  it('aplica una política versionada, registra respuesta, pausas y resolución sin alterar su copia', async () => {
    const policy = {
      name: 'Cobertura continua',
      priority: null,
      effectiveFrom: '2020-01-01T00:00:00.000Z',
      effectiveUntil: null,
      firstResponseMs: 3600000,
      resolutionMs: 7200000,
      calendar: {
        timeZone: 'America/Bogota',
        weekly: Object.fromEntries(
          Array.from({ length: 7 }, (_, day) => [day, [{ start: 0, end: 1440 }]]),
        ),
        exceptions: {},
      },
      pauseStatuses: ['pendiente_cliente'],
    };
    expect(
      (await tech.post('/api/v1/service-desk/policies').set('X-CSRF-Token', techCsrf).send(policy))
        .status,
    ).toBe(403);
    const created = await admin
      .post('/api/v1/service-desk/policies')
      .set('X-CSRF-Token', adminCsrf)
      .send(policy);
    expect(created.status).toBe(201);
    expect(
      (
        await admin
          .post('/api/v1/service-desk/policies')
          .set('X-CSRF-Token', adminCsrf)
          .send(policy)
      ).status,
    ).toBe(409);
    const ticket = await admin.post('/api/v1/tickets').set('X-CSRF-Token', adminCsrf).send({
      customerId,
      categoryId,
      title: 'Prueba SLA',
      description: 'Prueba integrada',
      priority: 'alta',
      assignedToUserId: techId,
    });
    expect(ticket.status).toBe(201);
    const ticketId = ticket.body.data.id;
    let row = ticket.body.data;
    const status = async (next: string, extra: object = {}) => {
      const response = await tech
        .patch(`/api/v1/tickets/${ticketId}`)
        .set('X-CSRF-Token', techCsrf)
        .send({ status: next, expectedUpdatedAt: row.updatedAt, ...extra });
      expect(response.status).toBe(200);
      row = response.body.data;
    };
    await status('en_proceso');
    await status('pendiente_cliente');
    let sla = await tech.get(`/api/v1/tickets/${ticketId}/sla`);
    expect(sla.status).toBe(200);
    expect(sla.body.data[0].resolution.paused).toBe(true);
    await status('en_proceso');
    const comment = await tech
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('X-CSRF-Token', techCsrf)
      .send({ body: 'Primera respuesta', visibility: 'cliente', requestId: randomUUID() });
    expect(comment.status).toBe(201);
    await status('resuelto', { resolution: 'Solucionado' });
    const version = await admin
      .post(`/api/v1/service-desk/policies/${created.body.data.id}/versions`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ ...policy, firstResponseMs: 60000 });
    expect(version.status).toBe(201);
    expect(version.body.data.version).toBe(2);
    expect(
      (
        await admin
          .post(`/api/v1/service-desk/policies/${created.body.data.id}/versions`)
          .set('X-CSRF-Token', adminCsrf)
          .send(policy)
      ).status,
    ).toBe(409);
    sla = await tech.get(`/api/v1/tickets/${ticketId}/sla`);
    expect(sla.body.data[0]).toMatchObject({
      policyId: created.body.data.id,
      policyVersion: 1,
      firstResponse: { status: 'fulfilled' },
      resolution: { status: 'fulfilled', paused: false },
    });
    expect(sla.body.data[0].firstResponse.remainingMs).toBeGreaterThan(60000);
    const reopened = await admin
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        status: 'reabierto',
        reopenReason: 'Reapertura de prueba',
        expectedUpdatedAt: row.updatedAt,
      });
    expect(reopened.status).toBe(200);
    const reopenedSla = await tech.get(`/api/v1/tickets/${ticketId}/sla`);
    expect(reopenedSla.body.data).toHaveLength(2);
    expect(reopenedSla.body.data[0].resolution.status).toBe('fulfilled');
    expect(reopenedSla.body.data[1]).toMatchObject({
      policyId: created.body.data.id,
      policyVersion: 1,
      resolution: { status: 'running' },
    });
    const foreign = await admin.post('/api/v1/tickets').set('X-CSRF-Token', adminCsrf).send({
      customerId,
      categoryId,
      title: 'Sin asignar',
      description: 'Privado',
      priority: 'alta',
    });
    const nextSla = await admin.get(`/api/v1/tickets/${foreign.body.data.id}/sla`);
    expect(nextSla.body.data[0]).toMatchObject({
      policyId: version.body.data.id,
      policyVersion: 2,
    });
    expect((await tech.get(`/api/v1/tickets/${foreign.body.data.id}/sla`)).status).toBe(404);
    const competing = await Promise.all([
      admin
        .post(`/api/v1/service-desk/policies/${version.body.data.id}/versions`)
        .set('X-CSRF-Token', adminCsrf)
        .send(policy),
      admin
        .post(`/api/v1/service-desk/policies/${version.body.data.id}/versions`)
        .set('X-CSRF-Token', adminCsrf)
        .send(policy),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
  });
  it('controla las plantillas, búsqueda y ediciones concurrentes', async () => {
    const data = {
      title: 'Reinicio seguro',
      body: 'Reinicie el equipo.',
      categoryId,
      active: true,
    };
    expect(
      (
        await tech
          .post('/api/v1/service-desk/response-templates')
          .set('X-CSRF-Token', techCsrf)
          .send(data)
      ).status,
    ).toBe(403);
    const created = await admin
      .post('/api/v1/service-desk/response-templates')
      .set('X-CSRF-Token', adminCsrf)
      .send(data);
    expect(created.status).toBe(201);
    const list = await tech.get('/api/v1/service-desk/response-templates?q=Reinicio');
    expect(list.body.data).toHaveLength(1);
    const payload = {
      ...data,
      body: 'Pruebe después de reiniciar.',
      expectedUpdatedAt: created.body.data.updatedAt,
    };
    const changed = await admin
      .put(`/api/v1/service-desk/response-templates/${created.body.data.id}`)
      .set('X-CSRF-Token', adminCsrf)
      .send(payload);
    expect(changed.status).toBe(200);
    expect(
      (
        await admin
          .put(`/api/v1/service-desk/response-templates/${created.body.data.id}`)
          .set('X-CSRF-Token', adminCsrf)
          .send(payload)
      ).status,
    ).toBe(409);
    const disabled = await admin
      .put(`/api/v1/service-desk/response-templates/${created.body.data.id}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ ...data, active: false, expectedUpdatedAt: changed.body.data.updatedAt });
    expect(disabled.status).toBe(200);
    expect((await tech.get('/api/v1/service-desk/response-templates')).body.data).toHaveLength(0);
  });
  it('valida el formulario del servicio y preserva su versión al actualizarlo', async () => {
    const service = {
      name: 'Reparación',
      description: 'Soporte de equipos',
      categoryId,
      responsibleTeam: 'Soporte',
      active: true,
      defaultPriority: 'alta',
      form: {
        version: 1,
        fields: [{ key: 'equipo', label: 'Equipo', type: 'text', required: true, maxLength: 80 }],
      },
    };
    const created = await admin
      .post('/api/v1/service-desk/services')
      .set('X-CSRF-Token', adminCsrf)
      .send(service);
    expect(created.status).toBe(201);
    const serviceId = created.body.data.id;
    const policy = {
      name: 'Equipos',
      serviceId,
      priority: null,
      effectiveFrom: '2020-01-01T00:00:00.000Z',
      firstResponseMs: 3600000,
      resolutionMs: 7200000,
      calendar: {
        timeZone: 'America/Bogota',
        weekly: Object.fromEntries(
          Array.from({ length: 7 }, (_, day) => [day, [{ start: 0, end: 1440 }]]),
        ),
        exceptions: {},
      },
      pauseStatuses: [],
    };
    const specific = await admin
      .post('/api/v1/service-desk/policies')
      .set('X-CSRF-Token', adminCsrf)
      .send(policy);
    expect(specific.status).toBe(201);
    const ticket = {
      customerId,
      categoryId,
      title: 'Reparar',
      description: 'No enciende',
      priority: 'alta',
      serviceId,
      requestType: 'incidente',
      customFields: {},
    };
    expect(
      (await admin.post('/api/v1/tickets').set('X-CSRF-Token', adminCsrf).send(ticket)).status,
    ).toBe(400);
    const made = await admin
      .post('/api/v1/tickets')
      .set('X-CSRF-Token', adminCsrf)
      .send({ ...ticket, customFields: { equipo: 'Portátil' } });
    expect(made.status).toBe(201);
    const sla = await admin.get(`/api/v1/tickets/${made.body.data.id}/sla`);
    expect(sla.body.data[0].policyId).toBe(specific.body.data.id);
    const edited = await admin
      .put(`/api/v1/service-desk/services/${serviceId}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        ...service,
        form: { version: 1, fields: [] },
        expectedUpdatedAt: created.body.data.updatedAt,
      });
    expect(edited.status).toBe(200);
    expect(edited.body.data.form.version).toBe(2);
    const details = await admin.get(`/api/v1/tickets/${made.body.data.id}/service`);
    expect(details.body.data).toMatchObject({
      requestType: 'incidente',
      form: { version: 1 },
      values: { equipo: 'Portátil' },
    });
  });
  it('calcula y conserva la prioridad a partir de una matriz versionada', async () => {
    const levels = ['baja', 'media', 'alta', 'urgente'];
    const matrix = Object.fromEntries(
      levels.map((impact, i) => [
        impact,
        Object.fromEntries(levels.map((urgency, j) => [urgency, levels[Math.max(i, j)]])),
      ]),
    );
    expect(
      (
        await tech
          .post('/api/v1/service-desk/priority-matrix')
          .set('X-CSRF-Token', techCsrf)
          .send({ matrix, expectedVersion: null })
      ).status,
    ).toBe(403);
    const created = await admin
      .post('/api/v1/service-desk/priority-matrix')
      .set('X-CSRF-Token', adminCsrf)
      .send({ matrix, expectedVersion: null });
    expect(created.status).toBe(201);
    expect(
      (
        await admin
          .post('/api/v1/service-desk/priority-matrix')
          .set('X-CSRF-Token', adminCsrf)
          .send({ matrix, expectedVersion: null })
      ).status,
    ).toBe(409);
    const made = await admin.post('/api/v1/tickets').set('X-CSRF-Token', adminCsrf).send({
      customerId,
      categoryId,
      title: 'Matriz',
      description: 'Cálculo',
      priority: 'baja',
      impact: 'alta',
      urgency: 'media',
    });
    expect(made.status).toBe(201);
    expect(made.body.data.priority).toBe('alta');
    const info = await admin.get(`/api/v1/tickets/${made.body.data.id}/priority`);
    expect(info.body.data).toMatchObject({
      calculatedPriority: 'alta',
      impact: 'alta',
      urgency: 'media',
      matrixVersion: 1,
    });
  });
  it('guarda vistas privadas y protege su eliminación entre usuarios', async () => {
    const view = await admin
      .post('/api/v1/service-desk/views')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        name: 'Urgentes',
        filters: {
          q: '',
          status: '',
          priority: 'urgente',
          assignedTo: '',
          sort: 'createdAt',
          order: 'desc',
        },
      });
    expect(view.status).toBe(201);
    expect((await admin.get('/api/v1/service-desk/views')).body.data).toHaveLength(1);
    expect((await tech.get('/api/v1/service-desk/views')).body.data).toHaveLength(0);
    expect(
      (
        await tech
          .delete(`/api/v1/service-desk/views/${view.body.data.id}`)
          .set('X-CSRF-Token', techCsrf)
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .delete(`/api/v1/service-desk/views/${view.body.data.id}`)
          .set('X-CSRF-Token', adminCsrf)
      ).status,
    ).toBe(204);
  });
});
