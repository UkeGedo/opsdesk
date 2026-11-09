import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { io as client, type Socket } from 'socket.io-client';
const socketEvent = (socket: Socket, event: string) =>
  new Promise<unknown[]>((resolve) => socket.once(event, (...args: unknown[]) => resolve(args)));
import request from 'supertest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { realtime } from './realtime.js';
import { digest, randomToken } from './security.js';
import { categories, customers, notifications, sessions, tickets, users } from './schema.js';
import { config } from './config.js';

describe('actualizaciones en tiempo real', () => {
  it('autoriza la conexión, limita eventos y recupera novedades tras reconectar', async () => {
    const { db, sqlite } = openDatabase(':memory:');
    migrate(db, { migrationsFolder: './drizzle' });
    const date = new Date().toISOString();
    const expires = new Date(Date.now() + 3600000).toISOString();
    const first = randomUUID(),
      second = randomUUID(),
      customer = randomUUID(),
      category = randomUUID(),
      ticket = randomUUID();
    db.insert(users)
      .values([
        {
          id: first,
          fullName: 'Técnico A',
          email: 'a@test.local',
          passwordHash: 'test',
          role: 'tecnico',
          createdAt: date,
          updatedAt: date,
        },
        {
          id: second,
          fullName: 'Técnico B',
          email: 'b@test.local',
          passwordHash: 'test',
          role: 'tecnico',
          createdAt: date,
          updatedAt: date,
        },
      ])
      .run();
    const token1 = randomToken(),
      token2 = randomToken();
    db.insert(sessions)
      .values([
        {
          id: randomUUID(),
          userId: first,
          tokenHash: digest(token1),
          csrfHash: digest('a'),
          createdAt: date,
          lastSeenAt: date,
          expiresAt: expires,
        },
        {
          id: randomUUID(),
          userId: second,
          tokenHash: digest(token2),
          csrfHash: digest('b'),
          createdAt: date,
          lastSeenAt: date,
          expiresAt: expires,
        },
      ])
      .run();
    db.insert(customers)
      .values({ id: customer, name: 'Empresa', createdAt: date, updatedAt: date })
      .run();
    db.insert(categories).values({ id: category, name: 'Prueba' }).run();
    db.insert(tickets)
      .values({
        id: ticket,
        ticketNumber: 1,
        customerId: customer,
        categoryId: category,
        title: 'Fallo',
        description: 'Detalle',
        priority: 'media',
        status: 'asignado',
        createdByUserId: first,
        assignedToUserId: first,
        createdAt: date,
        updatedAt: date,
      })
      .run();
    let publish: ReturnType<typeof realtime>['publish'] = () => {};
    const http = createServer(createApp(db, { publish: (change) => publish(change) }));
    const live = realtime(http, db);
    publish = live.publish;
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Sin puerto');
    const url = `http://127.0.0.1:${address.port}`;
    const connect = (token: string) =>
      client(url, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: config.APP_ORIGIN, Cookie: `opsdesk_session=${token}` },
      });
    const a = connect(token1),
      b = connect(token2),
      bad = connect(randomToken());
    try {
      const badConnection = socketEvent(bad, 'connect_error');
      await Promise.all([socketEvent(a, 'connect'), socketEvent(b, 'connect')]);
      const [error] = await badConnection;
      expect(error).toBeTruthy();
      let leaked = 0;
      b.on('changed', () => leaked++);
      const change = socketEvent(a, 'changed');
      const comment = await request(http)
        .post(`/api/v1/tickets/${ticket}/comments`)
        .set('Cookie', `opsdesk_session=${token1}`)
        .set('X-CSRF-Token', 'a')
        .send({ body: 'Actualización', visibility: 'cliente', requestId: randomUUID() });
      expect(comment.status).toBe(201);
      await change;
      await new Promise((r) => setTimeout(r, 100));
      expect(leaked).toBe(0);
      a.disconnect();
      db.insert(notifications)
        .values({
          id: randomUUID(),
          recipientId: first,
          type: 'ticket_assigned',
          title: 'Asignado',
          message: 'Tienes un ticket',
          ticketId: ticket,
          createdAt: date,
        })
        .run();
      const again = connect(token1);
      await socketEvent(again, 'connect');
      const response = await request(http)
        .get('/api/v1/notifications')
        .set('Cookie', `opsdesk_session=${token1}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      again.disconnect();
    } finally {
      a.disconnect();
      b.disconnect();
      bad.disconnect();
      await live.close();
      sqlite.close();
    }
  });
});
