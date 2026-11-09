# Decisiones de arquitectura

- **Monolito y SQLite:** se mantienen el archivo persistente, claves foráneas, WAL y las migraciones existentes. La fase de reorganización no cambia tablas ni recrea datos. No se promete escalado horizontal.
- **Límites por dominio:** servicios de usuarios, clientes y tickets se separan de los esquemas Zod; tareas, inventario, activos y reportes mantienen sus rutas agrupadas. Se evitan repositorios y controladores vacíos que solo reenvían llamadas.
- **Contratos compartidos:** los tipos de roles, estados, cliente y paginación son de compilación; el servidor valida entradas con Zod. Extenderlos sin romper integradores existentes.
- **Eventos en proceso:** se notifican después de transacciones confirmadas y se aíslan fallos de suscriptores. No ofrecen durabilidad, reintento ni entrega exactamente una vez; la auditoría y notificaciones que requieren consistencia permanecen transaccionales. Para integrar sistemas externos, diseñar un outbox persistente y consumidores idempotentes.
- **Compatibilidad:** rutas HTTP, permisos, datos y formato de respuestas se preservan. La nueva organización de archivos internos no es una API pública.
