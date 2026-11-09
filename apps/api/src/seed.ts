import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { openDatabase } from './db.js';
import {
  categories,
  comments,
  counters,
  customers,
  customerUsers,
  events,
  ticketAssignments,
  notifications,
  inventoryProducts,
  inventoryLocations,
  inventoryStock,
  inventoryMovements,
  inventoryAssets,
  inventoryAssetEvents,
  inventoryAlerts,
  tasks,
  taskEvents,
  taskNotifications,
  tickets,
  users,
} from './schema.js';
import { config } from './config.js';
if (config.NODE_ENV === 'production') throw new Error('El seed está prohibido en producción.');
const password = z.string().min(12).max(256).parse(process.env.SEED_PASSWORD);
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
const { db, sqlite } = openDatabase();
try {
  db.transaction((tx) => {
    if (tx.select({ id: users.id }).from(users).get())
      throw new Error('El seed requiere una base vacía.');
    const date = new Date().toISOString();
    const admin = randomUUID();
    const tech = randomUUID();
    const userRows = [
      {
        id: admin,
        fullName: 'Marina Salcedo',
        email: 'admin@example.test',
        role: 'administrador' as const,
      },
      {
        id: randomUUID(),
        fullName: 'Simón Herrera',
        email: 'supervisor@example.test',
        role: 'supervisor' as const,
      },
      {
        id: tech,
        fullName: 'Lucía Benavides',
        email: 'tecnico@example.test',
        role: 'tecnico' as const,
      },
      {
        id: randomUUID(),
        fullName: 'Elena Duarte',
        email: 'cliente@example.test',
        role: 'cliente' as const,
      },
    ];
    tx.insert(users)
      .values(
        userRows.map((u) => ({
          ...u,
          passwordHash,
          status: 'activo' as const,
          createdAt: date,
          updatedAt: date,
        })),
      )
      .run();
    const categoryRows = [
      'Acceso y cuentas',
      'Equipos de trabajo',
      'Conectividad',
      'Aplicaciones',
    ].map((name) => ({ id: randomUUID(), name, active: true }));
    tx.insert(categories).values(categoryRows).run();
    const names = [
      'Alborada',
      'Horizonte',
      'Ladera',
      'Norte Claro',
      'Azahar',
      'Río Abierto',
      'Páramo',
      'Cauce',
      'Sendero',
      'Lumbre',
      'Arrayán',
      'Vértice',
      'Nimbo',
      'Tierra Alta',
      'Cedro',
      'Brújula',
      'Colina',
      'Marea',
      'Umbral',
      'Amanecer',
      'Bosque',
      'Solana',
      'Raudal',
      'Cumbre',
      'Trama',
      'Ventana',
      'Mirador',
      'Orilla',
      'Piedra Azul',
      'Arboleda',
    ];
    const customerRows = names.map((name, i) => ({
      id: randomUUID(),
      name: `Empresa ${name}`,
      documentType: 'NIT',
      documentNumber: `900000${String(i).padStart(3, '0')}`,
      email: `cliente${i + 1}@example.test`,
      phone: null,
      address: null,
      notes: null,
      status: 'activo' as const,
      createdAt: date,
      updatedAt: date,
    }));
    tx.insert(customers).values(customerRows).run();
    tx.insert(customerUsers)
      .values({ userId: userRows[3].id, customerId: customerRows[0].id })
      .run();
    const priorities = ['baja', 'media', 'alta', 'urgente'] as const;
    const statuses = [
      'abierto',
      'asignado',
      'en_proceso',
      'pendiente_cliente',
      'resuelto',
      'cerrado',
      'reabierto',
    ] as const;
    let openTicketId = '';
    for (let i = 0; i < 60; i++) {
      const created = new Date(Date.now() - (60 - i) * 86400000).toISOString();
      const id = randomUUID();
      const state = statuses[i % statuses.length];
      if (i === 1) openTicketId = id;
      const paths: Record<string, string[]> = {
        abierto: [],
        asignado: [],
        en_proceso: ['en_proceso'],
        pendiente_cliente: ['en_proceso', 'pendiente_cliente'],
        resuelto: ['en_proceso', 'resuelto'],
        cerrado: ['en_proceso', 'resuelto', 'cerrado'],
        reabierto: ['en_proceso', 'resuelto', 'reabierto'],
      };
      const steps = paths[state];
      const at = (seconds: number) => new Date(Date.parse(created) + seconds * 1000).toISOString();
      tx.insert(tickets)
        .values({
          id,
          ticketNumber: i + 1,
          customerId: customerRows[i % 30].id,
          categoryId: categoryRows[i % 4].id,
          title: `Solicitud de ${categoryRows[i % 4].name.toLowerCase()} ${i + 1}`,
          description: 'Se solicita revisión y seguimiento del servicio.',
          priority: priorities[i % 4],
          status: state,
          createdByUserId: admin,
          assignedToUserId: state === 'abierto' ? null : tech,
          createdAt: created,
          updatedAt: state === 'abierto' ? created : at(1 + steps.length),
          resolution: ['resuelto', 'cerrado', 'reabierto'].includes(state)
            ? 'Se restableció el servicio y se verificó el funcionamiento.'
            : null,
          resolvedAt: state === 'resuelto' || state === 'cerrado' ? at(3) : null,
          closedAt: state === 'cerrado' ? at(4) : null,
        })
        .run();
      tx.insert(events)
        .values({
          id: randomUUID(),
          ticketId: id,
          actorId: admin,
          type: 'creado',
          detail: 'Ticket creado',
          createdAt: created,
        })
        .run();
      if (state !== 'abierto') {
        tx.insert(ticketAssignments)
          .values({
            id: randomUUID(),
            ticketId: id,
            assignedToUserId: tech,
            actorId: admin,
            createdAt: at(1),
          })
          .run();
        tx.insert(events)
          .values({
            id: randomUUID(),
            ticketId: id,
            actorId: admin,
            type: 'asignacion',
            detail: JSON.stringify({ previousUserId: null, assignedToUserId: tech }),
            createdAt: at(1),
          })
          .run();
        let previous = 'asignado';
        for (const [index, next] of steps.entries()) {
          tx.insert(events)
            .values({
              id: randomUUID(),
              ticketId: id,
              actorId: next === 'cerrado' || next === 'reabierto' ? admin : tech,
              type: 'estado_cambiado',
              detail: JSON.stringify({
                from: previous,
                to: next,
                ...(next === 'reabierto' ? { reason: 'Se reproduce la incidencia.' } : {}),
              }),
              createdAt: at(index + 2),
            })
            .run();
          previous = next;
        }
      }
      if (i % 3 === 0)
        tx.insert(comments)
          .values({
            id: randomUUID(),
            ticketId: id,
            authorId: tech,
            body: 'Revisión inicial registrada para seguimiento.',
            visibility: 'interno',
            createdAt: created,
          })
          .run();
    }
    const locationId = randomUUID(),
      cableId = randomUUID(),
      adapterId = randomUUID();
    tx.insert(inventoryLocations)
      .values({ id: locationId, name: 'Almacén de demostración', createdAt: date })
      .run();
    tx.insert(inventoryProducts)
      .values([
        {
          id: cableId,
          name: 'Cable de red',
          unit: 'unidad',
          minimum: 5,
          createdAt: date,
          updatedAt: date,
        },
        {
          id: adapterId,
          name: 'Adaptador de red',
          unit: 'unidad',
          minimum: 5,
          createdAt: date,
          updatedAt: date,
        },
      ])
      .run();
    for (const product of [
      { id: cableId, quantity: 25 },
      { id: adapterId, quantity: 3 },
    ]) {
      tx.insert(inventoryStock)
        .values({ id: randomUUID(), productId: product.id, locationId, quantity: product.quantity })
        .run();
      tx.insert(inventoryMovements)
        .values({
          id: randomUUID(),
          requestId: randomUUID(),
          productId: product.id,
          destinationId: locationId,
          quantity: product.quantity,
          kind: 'entrada',
          reason: 'Inventario inicial de demostración',
          actorId: admin,
          createdAt: date,
        })
        .run();
    }
    const assetId = randomUUID(),
      taskId = randomUUID();
    tx.insert(inventoryAssets)
      .values({
        id: assetId,
        name: 'Equipo portátil de prueba',
        serial: 'DEMO-001',
        locationId,
        assignedTo: tech,
        createdAt: date,
        updatedAt: date,
      })
      .run();
    tx.insert(inventoryAssetEvents)
      .values({
        id: randomUUID(),
        assetId,
        actorId: admin,
        action: 'asignado',
        detail: JSON.stringify({ assignedTo: tech }),
        createdAt: date,
      })
      .run();
    tx.insert(tasks)
      .values({
        id: taskId,
        title: 'Comprobar conectividad',
        description: 'Revisar conexión en el ticket de demostración.',
        assigneeId: tech,
        priority: 'media',
        status: 'pendiente',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        ticketId: openTicketId,
        createdBy: admin,
        createdAt: date,
        updatedAt: date,
      })
      .run();
    tx.insert(taskEvents)
      .values({
        id: randomUUID(),
        taskId,
        actorId: admin,
        action: 'creada',
        detail: 'Tarea de demostración',
        createdAt: date,
      })
      .run();
    tx.insert(taskNotifications)
      .values({
        id: randomUUID(),
        taskId,
        recipientId: tech,
        type: 'asignada',
        message: 'Se te asignó la tarea Comprobar conectividad.',
        createdAt: date,
      })
      .run();
    tx.insert(notifications)
      .values({
        id: randomUUID(),
        recipientId: tech,
        type: 'ticket_assigned',
        title: 'Ticket asignado',
        message: 'Ticket de demostración asignado.',
        ticketId: openTicketId,
        createdAt: date,
      })
      .run();
    tx.insert(inventoryAlerts)
      .values({
        id: randomUUID(),
        recipientId: admin,
        productId: adapterId,
        message: 'Adaptador de red: 3 unidades; mínimo 5.',
        createdAt: date,
      })
      .run();
    tx.insert(counters).values({ name: 'ticket', value: 60 }).run();
  });
  console.log('Datos ficticios creados.');
} finally {
  sqlite.close();
}
