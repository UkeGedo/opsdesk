# Cambios

## Sin publicar — fase 2

- Migración inicial y API persistente de usuarios, clientes y tickets.
- Sesiones con Argon2id, CSRF, control administrativo y documentación OpenAPI.
- Seed explícito y pruebas de integración aisladas.

## Fase 1

- Fundamentos documentales, presentación pública, tema, ruta 404 y API de salud inicial.
- Preparación de conexión SQLite y configuración Drizzle; no hay migraciones de dominio.

## Fase 2 — comprobaciones locales

- Migración inicial Drizzle aplicada a la base local; sin sincronización destructiva.
- Base separada: seed con 4 usuarios, 30 clientes, 4 categorías, 60 tickets y 20 comentarios; `foreign_key_check` sin infracciones.
- Inicialización de administrador en base aislada: primera ejecución aceptada y segunda rechazada.
- Pruebas de integración con archivo temporal aislado: autenticación, CSRF, roles, validación, duplicados, filtros, paginación, integridad referencial, transacciones, persistencia y logout.
- Entorno de comprobación: Node 22.16 en Windows; Node 26 sigue pendiente de verificación.

## Cierre adicional de fundamentos

- Node 26.13: 12 pruebas de API ejecutadas con instalación limpia aislada; reconstruir dependencias nativas al cambiar de versión.
- Auditoría transaccional de las mutaciones disponibles, segunda migración Drizzle y copia consistente de SQLite.
- Pruebas Playwright de navegación, tema, móvil y revisión automatizada axe en ambos temas; no equivale a auditoría manual completa.
- Docker y Compose preparados, sin ejecución local por ausencia de Docker; CI actualizado.

## Validación adicional de contenedores

- Docker Desktop instalado por usuario desde el instalador oficial firmado; WSL 2.4.13.
- Construcción de imágenes Node 26 y Nginx, migraciones y arranque en volumen aislado.
- Sesión y creación de cliente comprobadas; el registro y sesión persistieron tras reiniciar el servicio. Volumen de prueba eliminado.
- Navegación manual por teclado y foco visible verificados en la página pública. Véase `docs/design/accessibility-evidence.md` para el alcance y límites.

- Validación automatizada de respuestas representativas contra los esquemas OpenAPI usando JSON Schema 2020-12.

- Trece pruebas de API aprobadas con Node 26 en Linux mediante la imagen Docker; la suite usa `NODE_ENV=test` para Supertest.

## Fase 3 — seguridad y acceso

- Sesiones con inactividad, rotación, revocación, CSRF por sesión y cookie `__Host-` en producción.
- Políticas de rol y pertenencia para clientes y tickets; vínculo explícito de cuenta de cliente y acceso limitado a comentarios.
- Recuperación por token de un solo uso y correo SMTP o buzón local; pantallas reales de acceso, recuperación y perfil.
- Auditoría de seguridad y migraciones aditivas 0002–0004; copia de seguridad antes de migrar.
- Drizzle y Vitest actualizados tras avisos; persisten dos avisos moderados de herramientas de desarrollo documentados.
