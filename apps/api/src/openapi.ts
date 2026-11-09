import { taskInput, taskPatchInput } from './tasks.js';
import { movementInput } from './inventory.js';
import { z } from 'zod';
import { config } from './config.js';
import { assignmentInput } from './assignments.js';
import {
  categoryCreate,
  commentCreate,
  customerCreate,
  customerPatch,
  ticketCreate,
  ticketPatch,
  userCreate,
  userPatch,
} from './domain.js';
const examples = new Map<z.ZodType, object>([
  [
    userCreate,
    {
      fullName: 'Elena Duarte',
      email: 'elena@example.test',
      password: 'ejemplo-seguro-2026',
      role: 'tecnico',
      status: 'activo',
    },
  ],
  [
    customerCreate,
    {
      name: 'Empresa Horizonte',
      documentType: 'NIT',
      documentNumber: '900000001',
      email: 'contacto@example.test',
      status: 'activo',
    },
  ],
  [categoryCreate, { name: 'Conectividad', description: 'Incidencias de red', active: true }],
  [
    ticketCreate,
    {
      customerId: 'a0000000-0000-4000-8000-000000000001',
      categoryId: 'a0000000-0000-4000-8000-000000000002',
      title: 'Sin conexión',
      description: 'No hay acceso a la red.',
      priority: 'alta',
    },
  ],
  [
    commentCreate,
    {
      body: 'Se revisó la conexión.',
      visibility: 'interno',
      requestId: 'a0000000-0000-4000-8000-000000000003',
    },
  ],
]);
const json = (schema: z.ZodType) => ({
  'application/json': {
    schema: z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }),
    ...(examples.has(schema) ? { example: examples.get(schema) } : {}),
  },
});
const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
        requestId: { type: 'string', format: 'uuid' },
      },
    },
  },
};
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorSchema } },
});
const errors = {
  '400': errorResponse('Datos inválidos'),
  '401': errorResponse('Sesión ausente o inválida'),
  '403': errorResponse('Permiso o CSRF insuficiente'),
  '404': errorResponse('Recurso no encontrado'),
  '409': errorResponse('Conflicto de integridad'),
  '429': errorResponse('Demasiados intentos'),
  '500': errorResponse('Error interno'),
  '503': errorResponse('Servicio no disponible'),
};
const pathId = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const csrf = { name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' } };
const parameter = (name: string, schema: object) => ({
  name,
  in: 'query',
  required: false,
  schema,
});
const commonQuery = [
  parameter('page', { type: 'integer', minimum: 1, default: 1 }),
  parameter('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
  parameter('q', { type: 'string', maxLength: 100 }),
  parameter('order', { type: 'string', enum: ['asc', 'desc'], default: 'asc' }),
];
const userQuery = [
  ...commonQuery,
  parameter('sort', { type: 'string', enum: ['fullName', 'email', 'createdAt'] }),
  parameter('status', { type: 'string', enum: ['activo', 'inactivo'] }),
];
const customerQuery = [
  ...commonQuery,
  parameter('sort', { type: 'string', enum: ['name', 'email', 'createdAt'] }),
  parameter('status', { type: 'string', enum: ['activo', 'inactivo'] }),
];
const ticketQuery = [
  ...commonQuery,
  parameter('sort', { type: 'string', enum: ['ticketNumber', 'title', 'createdAt', 'priority'] }),
  parameter('status', {
    type: 'string',
    enum: [
      'abierto',
      'asignado',
      'en_proceso',
      'pendiente_cliente',
      'resuelto',
      'cerrado',
      'reabierto',
    ],
  }),
  parameter('priority', { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] }),
  parameter('customerId', { type: 'string', format: 'uuid' }),
  parameter('categoryId', { type: 'string', format: 'uuid' }),
  parameter('assignedTo', { oneOf: [{ type: 'string', format: 'uuid' }, { const: 'unassigned' }] }),
];
const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date-time' };
const nullableText = { type: ['string', 'null'] };
const user = {
  type: 'object',
  required: ['id', 'fullName', 'email', 'role', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: uuid,
    fullName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['administrador', 'supervisor', 'tecnico', 'cliente'] },
    status: { type: 'string', enum: ['activo', 'inactivo'] },
    createdAt: date,
    updatedAt: date,
  },
};
const customer = {
  type: 'object',
  properties: {
    id: uuid,
    name: { type: 'string' },
    documentType: nullableText,
    documentNumber: nullableText,
    email: nullableText,
    phone: nullableText,
    address: nullableText,
    notes: nullableText,
    status: { type: 'string', enum: ['activo', 'inactivo'] },
    createdAt: date,
    updatedAt: date,
  },
};
const category = {
  type: 'object',
  properties: {
    id: uuid,
    name: { type: 'string' },
    description: nullableText,
    active: { type: 'boolean' },
  },
};
const ticket = {
  type: 'object',
  properties: {
    id: uuid,
    ticketNumber: { type: 'integer' },
    customerId: uuid,
    categoryId: uuid,
    title: { type: 'string' },
    description: { type: 'string' },
    priority: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] },
    status: {
      type: 'string',
      enum: [
        'abierto',
        'asignado',
        'en_proceso',
        'pendiente_cliente',
        'resuelto',
        'cerrado',
        'reabierto',
      ],
    },
    createdByUserId: uuid,
    assignedToUserId: { type: ['string', 'null'], format: 'uuid' },
    createdAt: date,
    updatedAt: date,
    resolvedAt: { type: ['string', 'null'], format: 'date-time' },
    closedAt: { type: ['string', 'null'], format: 'date-time' },
    archivedAt: { type: ['string', 'null'], format: 'date-time' },
  },
};
const comment = {
  type: 'object',
  properties: {
    id: uuid,
    ticketId: uuid,
    authorId: uuid,
    body: { type: 'string' },
    visibility: { type: 'string', enum: ['interno', 'cliente'] },
    createdAt: date,
  },
};
const event = {
  type: 'object',
  properties: {
    id: uuid,
    ticketId: uuid,
    actorId: uuid,
    type: { type: 'string' },
    detail: { type: 'string' },
    createdAt: date,
  },
};
const bySummary: Record<string, object> = {
  'Usuario actual': user,
  'Listar usuarios': user,
  'Crear usuario': user,
  'Consultar usuario': user,
  'Actualizar usuario': user,
  'Listar clientes': customer,
  'Crear cliente': customer,
  'Consultar cliente': customer,
  'Actualizar cliente': customer,
  'Listar categorías': category,
  'Crear categoría': category,
  'Listar tickets': ticket,
  'Tickets de cliente': ticket,
  'Crear ticket': ticket,
  'Consultar ticket': ticket,
  'Actualizar ticket': ticket,
  'Archivar ticket cerrado': ticket,
  'Registrar comentario': comment,
  'Consultar historial': {
    type: 'object',
    properties: {
      comments: { type: 'array', items: comment },
      events: { type: 'array', items: event },
    },
  },
};
const paginated = new Set([
  'Listar usuarios',
  'Listar clientes',
  'Listar tickets',
  'Tickets de cliente',
  'Listar tareas',
  'Listar productos',
  'Listar existencias',
  'Listar movimientos',
  'Listar activos',
  'Listar técnicos activos',
  'Listar ubicaciones',
  'Productos bajo mínimo',
]);
const operation = (
  summary: string,
  body?: z.ZodType,
  parameters: object[] = [],
  created = false,
) => {
  const item = bySummary[summary] ?? {};
  const list =
    paginated.has(summary) ||
    [
      'Listar categorías',
      'Historial de activos',
      'Historial de tareas',
      'Listar avisos de tareas',
      'Listar alertas de inventario',
      'Listar adjuntos',
      'Actividad reciente',
    ].includes(summary);
  const schema = {
    type: 'object',
    required: ['data'],
    properties: {
      data: list ? { type: 'array', items: item } : item,
      ...(paginated.has(summary)
        ? {
            meta: {
              type: 'object',
              required: ['page', 'limit', 'total'],
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
              },
            },
          }
        : {}),
    },
  };
  return {
    summary,
    security: [{ session: [] }],
    parameters: [...parameters, ...(body ? [csrf] : [])],
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses: {
      ...errors,
      [created ? '201' : '200']: {
        description: created ? 'Recurso creado' : 'Operación completada',
        content: { 'application/json': { schema } },
      },
    },
  };
};
const login = z.object({ email: z.email(), password: z.string().min(1) });
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'OpsDesk API',
    version: '1.0.0',
    description:
      'API v1. Las rutas privadas requieren sesión y permisos por rol y recurso; las mutaciones autenticadas requieren X-CSRF-Token.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: config.NODE_ENV === 'production' ? '__Host-opsdesk_session' : 'opsdesk_session',
      },
    },
  },
  paths: {
    '/ready': {
      get: {
        summary: 'Disponibilidad de SQLite y tablas requeridas',
        responses: {
          '200': { description: 'Dependencias disponibles' },
          '503': { description: 'Base de datos no disponible o sin inicializar' },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Salud del proceso',
        responses: { '200': { description: 'Proceso disponible' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Iniciar sesión',
        requestBody: { required: true, content: json(login) },
        responses: {
          ...errors,
          '200': {
            description: 'Sesión creada y token CSRF',
            headers: { 'Set-Cookie': { schema: { type: 'string' } } },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'object', properties: { csrfToken: { type: 'string' }, user } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        ...operation('Usuario actual'),
        responses: {
          ...errors,
          '200': {
            description: 'Usuario y token CSRF de la sesión',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data', 'csrfToken'],
                  properties: { data: user, csrfToken: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        ...operation('Cerrar sesión', undefined, [csrf]),
        responses: { ...errors, '204': { description: 'Sesión revocada' } },
      },
    },
    '/auth/password': {
      post: {
        ...operation(
          'Cambiar contraseña',
          z.object({ currentPassword: z.string(), newPassword: z.string().min(12) }),
        ),
        responses: { ...errors, '204': { description: 'Contraseña actualizada' } },
      },
    },
    '/auth/sessions': { get: operation('Listar sesiones') },
    '/auth/sessions/revoke-others': {
      post: {
        ...operation('Revocar otras sesiones', z.object({ password: z.string() })),
        responses: { ...errors, '204': { description: 'Sesiones revocadas' } },
      },
    },
    '/auth/sessions/{id}/revoke': {
      post: {
        ...operation('Revocar una sesión', z.object({ password: z.string() }), [pathId]),
        responses: { ...errors, '204': { description: 'Sesión revocada' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Solicitar recuperación',
        requestBody: { required: true, content: json(z.object({ email: z.email() })) },
        responses: { ...errors, '202': { description: 'Respuesta uniforme' } },
      },
    },
    '/auth/validate-reset': {
      post: {
        summary: 'Validar enlace de recuperación',
        requestBody: { required: true, content: json(z.object({ token: z.string() })) },
        responses: { ...errors, '204': { description: 'Enlace válido' } },
      },
    },
    '/auth/reset-password': {
      post: {
        summary: 'Restablecer contraseña',
        requestBody: {
          required: true,
          content: json(z.object({ token: z.string(), newPassword: z.string().min(12) })),
        },
        responses: { ...errors, '204': { description: 'Contraseña restablecida' } },
      },
    },
    '/profile': {
      get: operation('Consultar perfil'),
      patch: operation('Actualizar perfil', z.object({ fullName: z.string().min(1).max(200) })),
    },
    '/audit': { get: operation('Consultar auditoría') },
    '/users/{id}/customer': {
      put: {
        ...operation('Vincular cuenta de cliente', z.object({ customerId: z.uuid() }), [pathId]),
        responses: { ...errors, '204': { description: 'Cuenta vinculada' } },
      },
    },
    '/users': {
      get: operation('Listar usuarios', undefined, userQuery),
      post: operation('Crear usuario', userCreate, [], true),
    },
    '/users/{id}': {
      get: operation('Consultar usuario', undefined, [pathId]),
      patch: operation('Actualizar usuario', userPatch, [pathId]),
    },
    '/technicians': {
      get: operation('Listar técnicos activos', undefined, [
        parameter('q', { type: 'string', maxLength: 120 }),
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 100 }),
      ]),
    },
    '/customers': {
      get: operation('Listar clientes', undefined, customerQuery),
      post: operation('Crear cliente', customerCreate, [], true),
    },
    '/customers/{id}': {
      get: operation('Consultar cliente', undefined, [pathId]),
      patch: operation('Actualizar cliente', customerPatch, [pathId]),
    },
    '/customers/{id}/tickets': {
      get: operation('Tickets de cliente', undefined, [pathId, ...ticketQuery]),
    },
    '/categories': {
      get: operation('Listar categorías'),
      post: operation('Crear categoría', categoryCreate, [], true),
    },
    '/tickets': {
      get: operation('Listar tickets', undefined, ticketQuery),
      post: operation('Crear ticket', ticketCreate, [], true),
    },
    '/tickets/{id}': {
      get: operation('Consultar ticket', undefined, [pathId]),
      patch: operation('Actualizar ticket', ticketPatch, [pathId]),
    },
    '/tickets/{id}/assignment': { post: operation('Asignar técnico', assignmentInput, [pathId]) },
    '/tickets/{id}/assignments': {
      get: operation('Historial de asignaciones', undefined, [pathId]),
    },
    '/notifications': { get: operation('Consultar notificaciones') },
    '/notifications/{id}': { get: operation('Consultar notificación', undefined, [pathId]) },
    '/notifications/read': {
      post: {
        ...operation('Marcar notificaciones', z.object({ ids: z.array(z.uuid()).min(1).max(100) })),
        responses: { ...errors, '204': { description: 'Notificaciones marcadas' } },
      },
    },
    '/tickets/{id}/comments': {
      post: operation('Registrar comentario', commentCreate, [pathId], true),
    },
    '/tickets/{id}/history': { get: operation('Consultar historial', undefined, [pathId]) },
    '/tasks': {
      get: operation('Listar tareas', undefined, [
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 100 }),
        parameter('status', { type: 'string', enum: ['pendiente', 'en_proceso', 'completada'] }),
        parameter('assigneeId', uuid),
        parameter('overdue', { type: 'string', enum: ['true', 'false'] }),
      ]),
      post: operation('Crear tarea', taskInput, [], true),
    },
    '/tasks/{id}': { patch: operation('Actualizar tarea', taskPatchInput, [pathId]) },
    '/tasks/{id}/history': { get: operation('Historial de tareas', undefined, [pathId]) },
    '/tasks/notifications': { get: operation('Listar avisos de tareas') },
    '/tasks/notifications/read': {
      post: {
        ...operation(
          'Marcar avisos de tareas',
          z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
        ),
        responses: { ...errors, '204': { description: 'Avisos marcados' } },
      },
    },
    '/inventory/products': {
      get: operation('Listar productos', undefined, [
        parameter('q', { type: 'string', maxLength: 120 }),
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 500 }),
      ]),
      post: operation(
        'Crear producto',
        z
          .object({
            name: z.string().trim().min(1).max(120),
            unit: z.string().trim().min(1).max(120),
            minimum: z.number().int().min(0).max(1000000),
          })
          .strict(),
        [],
        true,
      ),
    },
    '/inventory/products/{id}': {
      patch: operation(
        'Editar producto',
        z
          .object({
            name: z.string().trim().min(1).max(120).optional(),
            unit: z.string().trim().min(1).max(120).optional(),
            minimum: z.number().int().min(0).max(1000000).optional(),
            expectedUpdatedAt: z.iso.datetime(),
          })
          .strict(),
        [pathId],
      ),
    },
    '/inventory/locations': {
      get: operation('Listar ubicaciones', undefined, [
        parameter('q', { type: 'string', maxLength: 120 }),
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 500 }),
      ]),
      post: operation(
        'Crear ubicación',
        z.object({ name: z.string().trim().min(1).max(120) }).strict(),
        [],
        true,
      ),
    },
    '/inventory/stock': {
      get: operation('Listar existencias', undefined, [
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 1000 }),
        parameter('productId', uuid),
        parameter('locationId', uuid),
      ]),
    },
    '/inventory/movements': {
      get: operation('Listar movimientos', undefined, [
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 200 }),
        parameter('productId', uuid),
        parameter('ticketId', uuid),
      ]),
      post: operation('Registrar movimiento', movementInput, [], true),
    },
    '/inventory/low-stock': {
      get: operation('Productos bajo mínimo', undefined, [
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 500 }),
      ]),
    },
    '/inventory/alerts': { get: operation('Listar alertas de inventario') },
    '/inventory/alerts/read': {
      post: {
        ...operation(
          'Marcar alertas de inventario',
          z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
        ),
        responses: { ...errors, '204': { description: 'Alertas marcadas' } },
      },
    },
    '/inventory/assets': {
      get: operation('Listar activos', undefined, [
        parameter('page', { type: 'integer', minimum: 1 }),
        parameter('limit', { type: 'integer', minimum: 1, maximum: 500 }),
        parameter('q', { type: 'string', maxLength: 120 }),
      ]),
      post: operation(
        'Crear activo',
        z
          .object({
            name: z.string().min(1).max(120),
            serial: z.string().min(1).max(120),
            locationId: z.uuid(),
          })
          .strict(),
        [],
        true,
      ),
    },
    '/inventory/assets/{id}/assignment': {
      post: operation(
        'Asignar o devolver activo',
        z
          .object({
            assigneeId: z.uuid().nullable(),
            ticketId: z.uuid().nullable(),
            locationId: z.uuid(),
            expectedUpdatedAt: z.iso.datetime(),
            reason: z.string().min(1).max(1000),
          })
          .strict(),
        [pathId],
      ),
    },
    '/inventory/assets/{id}/history': {
      get: operation('Historial de activos', undefined, [pathId]),
    },
    '/reports/summary': {
      get: operation('Indicadores', undefined, [
        parameter('from', { type: 'string', format: 'date-time' }),
        parameter('to', { type: 'string', format: 'date-time' }),
      ]),
    },
    '/reports/recent': { get: operation('Actividad reciente') },
    '/reports/tickets.csv': {
      post: {
        ...operation(
          'Exportar tickets',
          z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).strict(),
        ),
        responses: {
          ...errors,
          '200': {
            description: 'CSV UTF-8',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/tickets/{id}/attachments': {
      get: operation('Listar adjuntos', undefined, [pathId]),
      post: {
        summary: 'Subir adjunto',
        security: [{ session: [] }],
        parameters: [
          pathId,
          csrf,
          { name: 'name', in: 'query', required: true, schema: { type: 'string', maxLength: 180 } },
        ],
        requestBody: {
          required: true,
          content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        },
        responses: { ...errors, '201': { description: 'Adjunto guardado' } },
      },
    },
    '/tickets/{id}/attachments/{attachmentId}': {
      get: {
        summary: 'Descargar adjunto',
        security: [{ session: [] }],
        parameters: [pathId, { name: 'attachmentId', in: 'path', required: true, schema: uuid }],
        responses: {
          ...errors,
          '200': {
            description: 'Archivo descargable',
            content: {
              'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
            },
          },
        },
      },
    },
    '/tickets/{id}/archive': {
      post: operation('Archivar ticket cerrado', undefined, [pathId, csrf]),
    },
  },
};
