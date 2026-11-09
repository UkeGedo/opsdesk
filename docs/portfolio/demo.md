# Guion de demostración

Usar únicamente una base ficticia aislada. El seed exige una base vacía, se rechaza en producción y crea cuentas `admin@example.test`, `supervisor@example.test`, `tecnico@example.test` y `cliente@example.test` con la contraseña suministrada mediante `SEED_PASSWORD`. Las cuentas de administración y supervisión no son apropiadas para una demostración pública abierta. Nunca usar esta base con información real.

## Preparación local

Crear una base independiente mediante `DATABASE_PATH`; ejecutar `pnpm --filter @opsdesk/api db:migrate` y después `pnpm --filter @opsdesk/api db:seed` con una contraseña de prueba en `SEED_PASSWORD`. Iniciar la API y la interfaz con el mismo origen configurado. Para Compose aislado, crear un proyecto de nombre único, aplicar `node dist/migrate.js` y ejecutar `node dist/seed.js` con `NODE_ENV=development` solo durante el seed. No reutilizar volúmenes productivos.

Para restablecer: detener el entorno de demostración y eliminar **solo** su base y adjuntos o el volumen exclusivo creado para él; volver a migrar y ejecutar el seed. Verificar el nombre y la ubicación antes de eliminar. No ejecutar `docker compose down --volumes` sobre un proyecto que contenga datos reales.

## Recorrido de 5–7 minutos

1. Entrar como administrador; explicar indicadores y que los números son ficticios.
2. Abrir Clientes y registrar una organización de prueba; mostrar que el cliente solo ve su ámbito.
3. Entrar como cliente y crear un ticket con una categoría existente.
4. Como supervisor, abrir el ticket y asignarlo al técnico; observar el aviso.
5. Como técnico, registrar materiales desde el ticket, cambiarlo a en proceso y resolver con una solución.
6. Volver al cliente: mostrar solución, comentario público e historial; explicar que no ve notas internas.
7. Revisar inventario, un equipo por serie y una tarea; mostrar rechazo de una salida sin stock.
8. Volver al panel, aplicar un período y exportar CSV como supervisor o administrador.
9. Mostrar resultados de `pnpm --filter @opsdesk/api test:coverage`, Playwright y el informe de [evaluación](../operations/evaluation.md).

Las capturas del [panel](../assets/panel-demo.png) y del [inventario](../assets/inventario-demo.png) se generaron desde Compose con datos del seed. `apps/web/scripts/capture-demo.mjs` admite únicamente destinos locales y requiere `DEMO_URL` y `DEMO_PASSWORD`; no captura datos de un servicio público.
