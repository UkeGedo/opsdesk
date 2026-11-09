# Modelo de datos

Las tablas implementadas se definen en `apps/api/src/schema.ts` y las migraciones en `apps/api/drizzle/`. Usan UUID como identificador principal; los tickets tienen además un número secuencial. SQLite aplica claves foráneas, comprobaciones y restricciones únicas. Las fechas de la aplicación se expresan como texto UTC ISO 8601.

```mermaid
erDiagram
  USERS ||--o{ SESSIONS : posee
  USERS ||--o| CUSTOMER_USERS : vinculo
  CUSTOMERS ||--o{ CUSTOMER_USERS : agrupa
  CUSTOMERS ||--o{ TICKETS : solicita
  TICKET_CATEGORIES ||--o{ TICKETS : clasifica
  TICKETS ||--o{ TICKET_COMMENTS : contiene
  TICKETS ||--o{ TICKET_EVENTS : registra
  TICKETS ||--o{ TICKET_ASSIGNMENTS : conserva
  TICKETS ||--o{ TICKET_ATTACHMENTS : adjunta
  TICKETS ||--o{ NOTIFICATIONS : origina
  TICKETS o|--o{ TASKS : relaciona
  INVENTORY_PRODUCTS ||--o{ INVENTORY_STOCK : contabiliza
  INVENTORY_LOCATIONS ||--o{ INVENTORY_STOCK : almacena
  INVENTORY_PRODUCTS ||--o{ INVENTORY_MOVEMENTS : mueve
  TICKETS o|--o{ INVENTORY_MOVEMENTS : consume
  INVENTORY_LOCATIONS ||--o{ INVENTORY_ASSETS : ubica
  INVENTORY_ASSETS ||--o{ INVENTORY_ASSET_EVENTS : registra
  TASKS ||--o{ TASK_EVENTS : registra
  TASKS ||--o{ TASK_NOTIFICATIONS : origina
  USERS ||--o{ AUDIT_LOGS : ejecuta
```

| Grupo               | Entidades y restricciones destacadas                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad           | `users`, `sessions`, `customer_users`, `password_resets`; roles y estado restringidos, huellas de sesión y tokens únicas.                                                                                                                      |
| Atención            | `customers`, `ticket_categories`, `tickets`, `ticket_comments`, `ticket_events`, `ticket_assignments`, `ticket_attachments`, `counters`; historial persistente, número de ticket único y clave de reintento de comentario única cuando existe. |
| Inventario fungible | `inventory_products`, `inventory_locations`, `inventory_stock`, `inventory_movements`, `inventory_alerts`; stock por producto y ubicación único y no negativo, movimientos con `request_id` único.                                             |
| Equipos             | `inventory_assets`, `inventory_asset_events`; serie única, responsable y ticket opcionales, historial propio.                                                                                                                                  |
| Tareas y avisos     | `tasks`, `task_events`, `task_notifications`, `notifications`; responsable, estado, vencimiento y destinatario con claves foráneas.                                                                                                            |
| Auditoría           | `audit_logs`, `security_events`; separación entre acciones de negocio y eventos de seguridad. No hay endpoints de edición de auditoría.                                                                                                        |

El diagrama omite varias referencias a actores para favorecer la lectura; el esquema Drizzle es la fuente de verdad. El archivo privado de un adjunto no está en SQLite: la tabla conserva su identificador y metadatos, por lo que el respaldo operativo debe incluir la base y el directorio de adjuntos.
