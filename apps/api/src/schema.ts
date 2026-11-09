import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['administrador', 'supervisor', 'tecnico', 'cliente'] }).notNull(),
    status: text('status', { enum: ['activo', 'inactivo'] })
      .notNull()
      .default('activo'),
    ...timestamps,
  },
  (t) => [
    check('users_role', sql`${t.role} in ('administrador','supervisor','tecnico','cliente')`),
    check('users_status', sql`${t.status} in ('activo','inactivo')`),
  ],
);
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull().unique(),
    csrfHash: text('csrf_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    lastSeenAt: text('last_seen_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);
export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    documentType: text('document_type'),
    documentNumber: text('document_number'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    status: text('status', { enum: ['activo', 'inactivo'] })
      .notNull()
      .default('activo'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('customer_document_idx').on(t.documentType, t.documentNumber),
    index('customer_name_idx').on(t.name),
    check('customer_status', sql`${t.status} in ('activo','inactivo')`),
    check(
      'customer_document_pair',
      sql`(${t.documentType} is null and ${t.documentNumber} is null) or (${t.documentType} is not null and ${t.documentNumber} is not null)`,
    ),
  ],
);
export const categories = sqliteTable('ticket_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});
export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  responsibleTeam: text('responsible_team').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  defaultPriority: text('default_priority', {
    enum: ['baja', 'media', 'alta', 'urgente'],
  }).notNull(),
  formVersion: integer('form_version').notNull().default(1),
  formSchema: text('form_schema').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const tickets = sqliteTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    ticketNumber: integer('ticket_number').notNull().unique(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    priority: text('priority', { enum: ['baja', 'media', 'alta', 'urgente'] }).notNull(),
    status: text('status', {
      enum: [
        'abierto',
        'asignado',
        'en_proceso',
        'pendiente_cliente',
        'resuelto',
        'cerrado',
        'reabierto',
      ],
    })
      .notNull()
      .default('abierto'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedToUserId: text('assigned_to_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    ...timestamps,
    resolution: text('resolution'),
    resolvedAt: text('resolved_at'),
    closedAt: text('closed_at'),
    archivedAt: text('archived_at'),
  },
  (t) => [
    index('tickets_customer_idx').on(t.customerId, t.createdAt),
    index('tickets_status_idx').on(t.status, t.priority),
    check('ticket_priority', sql`${t.priority} in ('baja','media','alta','urgente')`),
    check(
      'ticket_status',
      sql`${t.status} in ('abierto','asignado','en_proceso','pendiente_cliente','resuelto','cerrado','reabierto')`,
    ),
  ],
);
export const comments = sqliteTable(
  'ticket_comments',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    requestId: text('request_id').unique(),
    visibility: text('visibility', { enum: ['interno', 'cliente'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('comments_ticket_idx').on(t.ticketId, t.createdAt),
    check('comment_visibility', sql`${t.visibility} in ('interno','cliente')`),
  ],
);
export const events = sqliteTable(
  'ticket_events',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    detail: text('detail').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('events_ticket_idx').on(t.ticketId, t.createdAt)],
);
export const counters = sqliteTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull(),
});
export const ticketServiceData = sqliteTable('ticket_service_data', {
  ticketId: text('ticket_id')
    .primaryKey()
    .references(() => tickets.id, { onDelete: 'restrict' }),
  serviceId: text('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'restrict' }),
  requestType: text('request_type', {
    enum: ['incidente', 'solicitud', 'consulta', 'operativo'],
  }).notNull(),
  formSnapshot: text('form_snapshot').notNull(),
  values: text('values').notNull(),
});
export const priorityMatrices = sqliteTable(
  'priority_matrices',
  {
    id: text('id').primaryKey(),
    version: integer('version').notNull(),
    matrix: text('matrix').notNull(),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex('priority_matrices_version_idx').on(t.version)],
);
export const ticketPriorityData = sqliteTable('ticket_priority_data', {
  ticketId: text('ticket_id')
    .primaryKey()
    .references(() => tickets.id, { onDelete: 'restrict' }),
  impact: text('impact').notNull(),
  urgency: text('urgency').notNull(),
  calculatedPriority: text('calculated_priority').notNull(),
  explanation: text('explanation').notNull(),
  matrixVersion: integer('matrix_version').notNull(),
  matrixSnapshot: text('matrix_snapshot').notNull(),
});
export const savedTicketViews = sqliteTable(
  'saved_ticket_views',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    filters: text('filters').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('saved_ticket_views_owner_idx').on(t.ownerId)],
);

// SLA policy versions are immutable; each ticket cycle also stores its own snapshot.
export const slaPolicies = sqliteTable(
  'sla_policies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    serviceId: text('service_id').references(() => services.id, { onDelete: 'restrict' }),
    priority: text('priority', { enum: ['baja', 'media', 'alta', 'urgente'] }),
    effectiveFrom: text('effective_from').notNull(),
    effectiveUntil: text('effective_until'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    firstResponseMs: integer('first_response_ms').notNull(),
    resolutionMs: integer('resolution_ms').notNull(),
    calendar: text('calendar').notNull(),
    pauseStatuses: text('pause_statuses').notNull(),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [check('sla_policy_targets', sql`${t.firstResponseMs} > 0 and ${t.resolutionMs} > 0`)],
);

export const ticketSlas = sqliteTable(
  'ticket_slas',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    policyId: text('policy_id')
      .notNull()
      .references(() => slaPolicies.id, { onDelete: 'restrict' }),
    snapshot: text('snapshot').notNull(),
    startedAt: text('started_at').notNull(),
    firstResponseAt: text('first_response_at'),
    resolvedAt: text('resolved_at'),
  },
  (t) => [index('ticket_slas_ticket_idx').on(t.ticketId, t.startedAt)],
);

export const ticketSlaPauses = sqliteTable(
  'ticket_sla_pauses',
  {
    id: text('id').primaryKey(),
    slaId: text('sla_id')
      .notNull()
      .references(() => ticketSlas.id, { onDelete: 'restrict' }),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
  },
  (t) => [index('ticket_sla_pauses_sla_idx').on(t.slaId, t.startedAt)],
);

export const responseTemplates = sqliteTable(
  'response_templates',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('response_templates_category_idx').on(t.categoryId, t.active)],
);

// Auditoría inmutable desde la API; se conserva aunque una cuenta sea desactivada.
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull().default('unknown'),
    outcome: text('outcome').notNull().default('success'),
    context: text('context'),
    resourceId: text('resource_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('audit_actor_date_idx').on(t.actorId, t.createdAt)],
);

export const customerUsers = sqliteTable(
  'customer_users',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
  },
  (t) => [index('customer_users_customer_idx').on(t.customerId)],
);
export const passwordResets = sqliteTable(
  'password_resets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)],
);
export const securityEvents = sqliteTable(
  'security_events',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    outcome: text('outcome', { enum: ['success', 'failure'] }).notNull(),
    context: text('context'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('security_events_created_idx').on(t.createdAt)],
);

export const ticketAssignments = sqliteTable(
  'ticket_assignments',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    assignedToUserId: text('assigned_to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    previousUserId: text('previous_user_id').references(() => users.id, { onDelete: 'restrict' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('ticket_assignments_ticket_idx').on(t.ticketId, t.createdAt)],
);
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    readAt: text('read_at'),
  },
  (t) => [index('notifications_recipient_idx').on(t.recipientId, t.readAt, t.createdAt)],
);
export const inventoryProducts = sqliteTable(
  'inventory_products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    minimum: integer('minimum').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull().default('1970-01-01T00:00:00.000Z'),
  },
  (t) => [check('inventory_minimum_nonnegative', sql`${t.minimum} >= 0`)],
);
export const inventoryLocations = sqliteTable('inventory_locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
export const inventoryStock = sqliteTable(
  'inventory_stock',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => inventoryProducts.id, { onDelete: 'restrict' }),
    locationId: text('location_id')
      .notNull()
      .references(() => inventoryLocations.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(0),
  },
  (t) => [
    uniqueIndex('inventory_stock_product_location').on(t.productId, t.locationId),
    check('inventory_stock_nonnegative', sql`${t.quantity} >= 0`),
  ],
);
export const inventoryMovements = sqliteTable(
  'inventory_movements',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull().unique(),
    productId: text('product_id')
      .notNull()
      .references(() => inventoryProducts.id, { onDelete: 'restrict' }),
    sourceId: text('source_id').references(() => inventoryLocations.id, { onDelete: 'restrict' }),
    destinationId: text('destination_id').references(() => inventoryLocations.id, {
      onDelete: 'restrict',
    }),
    ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    kind: text('kind', {
      enum: ['entrada', 'salida', 'transferencia', 'ajuste_entrada', 'ajuste_salida'],
    }).notNull(),
    reason: text('reason').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('inventory_movement_quantity', sql`${t.quantity} > 0`),
    index('inventory_movements_product_idx').on(t.productId, t.createdAt),
  ],
);
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    assigneeId: text('assignee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    priority: text('priority', { enum: ['baja', 'media', 'alta', 'urgente'] }).notNull(),
    status: text('status', { enum: ['pendiente', 'en_proceso', 'completada'] }).notNull(),
    dueAt: text('due_at'),
    completedAt: text('completed_at'),
    ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'restrict' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('tasks_assignee_idx').on(t.assigneeId, t.status),
    check('tasks_status_check', sql`${t.status} in ('pendiente','en_proceso','completada')`),
    check('tasks_priority_check', sql`${t.priority} in ('baja','media','alta','urgente')`),
  ],
);
export const taskEvents = sqliteTable(
  'task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    detail: text('detail').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('task_events_task_idx').on(t.taskId, t.createdAt)],
);
export const ticketAttachments = sqliteTable(
  'ticket_attachments',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('attachments_ticket_idx').on(t.ticketId, t.createdAt),
    check('attachment_positive_size', sql`${t.size} > 0`),
  ],
);
export const inventoryAssets = sqliteTable('inventory_assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  serial: text('serial').notNull().unique(),
  locationId: text('location_id')
    .notNull()
    .references(() => inventoryLocations.id, { onDelete: 'restrict' }),
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'restrict' }),
  ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'restrict' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const inventoryAssetEvents = sqliteTable(
  'inventory_asset_events',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => inventoryAssets.id, { onDelete: 'restrict' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    detail: text('detail').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('asset_event_asset_idx').on(t.assetId, t.createdAt)],
);
export const inventoryAlerts = sqliteTable(
  'inventory_alerts',
  {
    id: text('id').primaryKey(),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    productId: text('product_id')
      .notNull()
      .references(() => inventoryProducts.id, { onDelete: 'restrict' }),
    message: text('message').notNull(),
    createdAt: text('created_at').notNull(),
    readAt: text('read_at'),
  },
  (t) => [index('inventory_alerts_recipient_idx').on(t.recipientId, t.readAt, t.createdAt)],
);
export const taskNotifications = sqliteTable(
  'task_notifications',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ['asignada', 'vencimiento'] }).notNull(),
    message: text('message').notNull(),
    dueAt: text('due_at'),
    createdAt: text('created_at').notNull(),
    readAt: text('read_at'),
  },
  (t) => [index('task_notifications_recipient_idx').on(t.recipientId, t.readAt, t.createdAt)],
);
