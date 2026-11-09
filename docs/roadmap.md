# Estado y límites de OpsDesk

## Fase 5: procesos operativos

La aplicación implementa el ciclo de vida de tickets con transiciones explícitas, asignación y reasignación auditadas, seguimiento de comentarios y adjuntos, inventario por ubicación, equipos con serie, tareas, notificaciones, Socket.IO, indicadores y CSV. Los cambios de ticket, tarea, producto y equipo usan una versión para detectar actualizaciones desactualizadas; los movimientos y comentarios utilizan claves de idempotencia. El consumo de material se puede registrar desde el detalle del ticket y queda reflejado en su historial.

Las pruebas de integración cubren creación, asignación y resolución de tickets, control de acceso, reasignación, movimientos simultáneos, reversión ante fallos y recuperación de notificaciones tras reconexión. Los escenarios de navegador usan una base aislada y verifican el flujo entre cliente, supervisor y técnico, el consumo asociado a ticket, la recuperación de conexión y la prevención de salidas sin existencias.

La búsqueda de tickets permite filtrar por estado y responsable; las tablas de tickets, tareas, productos, existencias, movimientos y equipos admiten paginación. Las listas de opciones tienen límites por solicitud y búsqueda por nombre para localizar registros adicionales. El catálogo de ubicaciones y técnicos también admite búsqueda y paginación en la API.

La suma de existencias en todas las ubicaciones se compara con el mínimo de cada producto. Los ajustes positivos y negativos, entradas, salidas y transferencias son auditados. Los responsables reciben una alerta persistente al registrar un producto bajo mínimo o cruzar el umbral hacia abajo. Los técnicos reciben avisos de asignación y vencimiento de tareas; la consulta periódica genera un aviso por destinatario y fecha de vencimiento cuando faltan menos de 24 horas o ya venció. Las notificaciones anteriores a la incorporación de la fecha de vencimiento podrían generar un aviso adicional una vez tras la migración, porque no se reconstruye una fecha histórica que no fue almacenada.

Los indicadores filtran por creación de ticket entre inicio inclusivo y final exclusivo en UTC; el control visual incluye el día final. Los resueltos se cuentan por su fecha de resolución más reciente y las reaperturas por la fecha de cada evento. La carga por técnico cuenta tickets no resueltos ni cerrados creados en el período. El promedio de resolución mide horas desde la creación hasta la resolución actual y excluye tickets sin resolución. El CSV de tickets aplica los mismos filtros de creación, requiere administrador o supervisor, limita a 1000 filas, neutraliza fórmulas y deja auditoría.

Las conexiones Socket.IO requieren una sesión y origen autorizados y transmiten únicamente señales de cambio; al conectar o reconectar se consultan los datos de nuevo desde la API. Las notas internas no se envían a clientes y sus eventos se excluyen de sus vistas de historial y actividad reciente. Los comentarios públicos y cambios de estado generan avisos para los participantes autorizados.

Los adjuntos permiten PDF, PNG y JPEG con comprobación de firma, extensión y tamaño. Se almacenan fuera de rutas públicas y se descargan tras comprobar acceso. La validación de firma no es escaneo antimalware ni análisis completo del formato. Las copias de seguridad deben incluir el directorio de adjuntos además de SQLite; una interrupción durante la subida puede dejar archivos huérfanos para revisión. El límite predeterminado es 5 MiB y se configura con `ATTACHMENT_MAX_BYTES`.

El contrato de `PATCH /tickets/:id` y `PATCH /inventory/products/:id` requiere `expectedUpdatedAt`. `POST /tickets/:id/comments` y los movimientos de inventario requieren `requestId`; los integradores anteriores deben enviar estos campos para preservar la concurrencia y evitar duplicados. Las opciones de técnico para tareas y equipos muestran hasta 100 coincidencias por búsqueda y las de ubicaciones y materiales hasta 500 por búsqueda. Las listas de notificaciones muestran los registros más recientes y admiten marcar las visibles en grupo.

## Trabajo posterior

Quedan pendientes la evaluación con usuarios reales y tecnologías de asistencia, una revisión ASVS independiente, la configuración y prueba de un proveedor SMTP real y una política de retención de auditoría. El administrador puede editar los datos de contacto y estado del cliente; la interfaz detecta cambios simultáneos y el detalle completo puede ampliarse. Los integradores antiguos deben enviar `expectedUpdatedAt` para obtener la misma protección.
