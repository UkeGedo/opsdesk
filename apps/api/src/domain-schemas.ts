import { z } from 'zod';
import type { AccountRole, CustomerStatus, TicketStatus } from '@opsdesk/shared/contracts';
import { id, pageQuery } from './common.js';

const nonempty = z.string().trim().min(1).max(200);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const role = z.enum(['administrador', 'supervisor', 'tecnico', 'cliente'] satisfies AccountRole[]);
const status = z.enum(['activo', 'inactivo'] satisfies CustomerStatus[]);
const priority = z.enum(['baja', 'media', 'alta', 'urgente']);
const ticketStatus = z.enum([
  'abierto',
  'asignado',
  'en_proceso',
  'pendiente_cliente',
  'resuelto',
  'cerrado',
  'reabierto',
] satisfies TicketStatus[]);
const optionalText = z.string().trim().max(500).nullable().optional();
export const userCreate = z
  .object({
    fullName: nonempty,
    email,
    password: z.string().min(12).max(256),
    role,
    status: status.default('activo'),
  })
  .strict();
export const userPatch = z
  .object({
    fullName: nonempty.optional(),
    email: email.optional(),
    role: role.optional(),
    status: status.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Indique algún campo.');
const customerBase = z
  .object({
    name: nonempty,
    documentType: optionalText,
    documentNumber: optionalText,
    email: email.nullable().optional(),
    phone: optionalText,
    address: optionalText,
    notes: optionalText,
    status: status.default('activo'),
  })
  .strict();
export const documentPair = (v: { documentType?: string | null; documentNumber?: string | null }) =>
  Boolean(v.documentType) === Boolean(v.documentNumber);
export const customerCreate = customerBase.refine(
  documentPair,
  'Indique tipo y número de documento juntos.',
);
export const customerPatch = customerBase
  .partial()
  .extend({ status: status.optional(), expectedUpdatedAt: z.iso.datetime().optional() })
  .refine((v) => Object.keys(v).some((key) => key !== 'expectedUpdatedAt'), 'Indique algún campo.');
export const categoryCreate = z
  .object({ name: nonempty, description: optionalText, active: z.boolean().default(true) })
  .strict();
export const ticketCreate = z
  .object({
    customerId: id,
    categoryId: id,
    title: nonempty,
    description: z.string().trim().min(1).max(10000),
    priority,
    assignedToUserId: id.nullable().optional(),
    serviceId: id.optional(),
    requestType: z.enum(['incidente', 'solicitud', 'consulta', 'operativo']).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    impact: priority.optional(),
    urgency: priority.optional(),
  })
  .strict()
  .refine(
    (v) => !!v.serviceId === !!v.requestType && (!v.customFields || !!v.serviceId),
    'Indique el servicio y el tipo de solicitud juntos.',
  )
  .refine((v) => !!v.impact === !!v.urgency, 'Indique impacto y urgencia juntos.');
export const ticketPatch = z
  .object({
    title: nonempty.optional(),
    description: z.string().trim().min(1).max(10000).optional(),
    priority: priority.optional(),
    status: ticketStatus.optional(),
    resolution: z.string().trim().min(1).max(10000).optional(),
    reopenReason: z.string().trim().min(1).max(1000).optional(),
    expectedUpdatedAt: z.iso.datetime(),
    categoryId: id.optional(),
    assignedToUserId: id.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'expectedUpdatedAt'), 'Indique algún campo.');
export const commentCreate = z
  .object({
    body: z.string().trim().min(1).max(10000),
    visibility: z.enum(['interno', 'cliente']),
    requestId: id,
  })
  .strict();
export const listUsers = z
  .object({
    ...pageQuery,
    sort: z.enum(['fullName', 'email', 'createdAt']).default('fullName'),
    status: status.optional(),
  })
  .strict();
export const listCustomers = z
  .object({
    ...pageQuery,
    sort: z.enum(['name', 'email', 'createdAt']).default('name'),
    status: status.optional(),
  })
  .strict();
export const listTickets = z
  .object({
    ...pageQuery,
    sort: z.enum(['ticketNumber', 'title', 'createdAt', 'priority']).default('createdAt'),
    status: ticketStatus.optional(),
    priority: priority.optional(),
    categoryId: id.optional(),
    customerId: id.optional(),
    assignedTo: z.union([id, z.literal('unassigned')]).optional(),
  })
  .strict();
