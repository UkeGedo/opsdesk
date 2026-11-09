# API v1 y operación

La API devuelve JSON, identificador `X-Request-Id` y errores `{error:{code,message,details?,requestId}}`. La referencia OpenAPI navegable está en `/api/v1/docs` y el documento en `/api/v1/openapi.json`; ambos requieren sesión de administrador. La documentación se genera parcialmente desde los esquemas Zod de entrada. `health` comprueba el proceso y `ready` consulta SQLite y tablas seleccionadas; no valida todos los recursos externos.

## Instalación y migración

Desde la raíz, `pnpm install`, después `pnpm --filter @opsdesk/api db:migrate`. Las migraciones Drizzle son explícitas y no se ejecutan al arrancar. Respaldar la base antes de actualizar. `DATABASE_PATH` es relativo al directorio `apps/api` cuando se usa pnpm con filtro; por defecto `./data/opsdesk.db`. En cada conexión se habilitan claves foráneas, WAL y espera de 5 segundos. Ejecutar una sola instancia y alojar el archivo en almacenamiento local persistente.

Para inicializar por única vez, con tabla de usuarios vacía, proporcionar `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL` y `BOOTSTRAP_PASSWORD` (mínimo 12 caracteres) en el entorno y ejecutar `pnpm --filter @opsdesk/api db:bootstrap`. No guardar la contraseña en archivos versionados. La operación falla si ya existe cualquier usuario. La protección de la consola y el entorno es responsabilidad de la instalación.

El seed es explícito, solo fuera de producción y requiere base vacía migrada. Con `DATABASE_PATH` apuntando a un archivo de pruebas independiente y `SEED_PASSWORD` de al menos 12 caracteres, ejecutar `pnpm --filter @opsdesk/api db:seed`. Crea cuatro cuentas `@example.test`, 30 clientes, 60 tickets, inventario, equipo, tarea y avisos ficticios. No usar ese archivo para producción.

## Sesiones y llamadas

`POST /api/v1/auth/login` recibe `{email,password}` y devuelve cookie HttpOnly y `data.csrfToken`. Enviar la cookie y `X-CSRF-Token` en cada mutación posterior; `GET /auth/me` consulta la sesión y `POST /auth/logout` la revoca. Cookie SameSite Strict; Secure y prefijo `__Host-` en producción. Configurar `APP_ORIGIN` al origen real del frontend para validar el origen del login y servir HTTPS en producción. Los clientes de API que omiten Origin necesitan JSON; CORS con credenciales solo admite el origen configurado en `APP_ORIGIN`. El token CSRF se recupera en `/auth/me` para la sesión activa y permanece solo en memoria del cliente. El límite de intentos es local al proceso y no sustituye un limitador compartido en un despliegue multiinstancia.

Los recursos aplican permisos por rol y ámbito. Además de usuarios, clientes, categorías y tickets, la API ofrece asignaciones, comentarios, historial, adjuntos, tareas, inventario, activos, avisos y reportes. La especificación navegable describe los recursos y el formato de entrada; sus respuestas genéricas y parámetros no sustituyen pruebas de contrato exhaustivas. No se ha validado un despliegue multiinstancia.

Los listados paginados devuelven `data` y `meta` con página, límite y total; los máximos dependen de cada recurso. `PATCH /tickets/:id`, `POST /tickets/:id/assignment`, `PATCH /inventory/products/:id`, `PATCH /tasks/:id` y la asignación de activos requieren `expectedUpdatedAt` para rechazar cambios desactualizados. Los movimientos y comentarios requieren un UUID `requestId` estable para reintentos: si los datos cambian con la misma clave, se devuelve conflicto. Las descargas de adjuntos se autorizan por ticket y se sirven como archivos descargables.

En `PATCH /customers/:id`, enviar el `updatedAt` leído como `expectedUpdatedAt` para recibir `409 STALE_CUSTOMER` si otra edición se guardó antes. El campo sigue siendo opcional para clientes anteriores, que no tendrán protección frente a escrituras obsoletas hasta que se actualicen. La interfaz lo envía automáticamente y, ante conflicto, exige volver a abrir el formulario con datos actualizados.

La API de avisos y Socket.IO vuelven a comprobar el acceso actual. Los datos de clientes y técnicos ajenos se filtran en el servidor; los clientes no pueden leer notas internas. La exportación CSV es exclusiva de administración o supervisión y está limitada a 1000 filas. Los filtros, límites y definiciones de métricas se describen en [roadmap](../roadmap.md).

## Copias y restauración

Con la base existente y `BACKUP_PATH` apuntando a un archivo nuevo fuera del directorio de datos, ejecutar `pnpm --filter @opsdesk/api db:backup`. Usa la API de copia de SQLite, compatible con WAL; rechaza sobrescribir el archivo de origen o una copia existente. Guardar copias cifradas y con acceso restringido. Para restaurar, detener la API, conservar la base anterior, reemplazar el archivo de datos con una copia verificada y retirar los archivos WAL/SHM únicamente después de cerrar todas las conexiones. Arrancar y verificar integridad y funciones. Ensayar periódicamente en un entorno aislado. El script no cifra, programa ni transfiere copias.

## Pruebas en contenedor

La imagen de ejecución no incluye OpenSSL de línea de comandos. Para ejecutar las pruebas, incluida la prueba SMTP local con TLS, construye la etapa de pruebas y ejecútala:

```sh
docker build -f infrastructure/Dockerfile --target test -t opsdesk-tests .
docker run --rm opsdesk-tests
```

La etapa de pruebas usa `NODE_ENV=test` porque Supertest utiliza HTTP local. La configuración segura de cookies de producción se verifica con Playwright en la integración de Docker.

## Recuperación de acceso

En desarrollo `MAIL_MODE=file` es el valor predeterminado y deja el mensaje de prueba en `apps/api/data/mail`, que no se sirve por HTTP ni se versiona. El archivo contiene un enlace sensible; elimina los mensajes de prueba cuando termines. En producción `MAIL_MODE=disabled` es el valor predeterminado: para habilitar envío real configura `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_SECURE`, opcionalmente `SMTP_USER`/`SMTP_PASSWORD`, y `APP_ORIGIN` con HTTPS. El transporte exige TLS; las credenciales proceden del entorno y no se guardan en Git. No hay proveedor ni credenciales de producción preconfigurados. Se verificó el transporte SMTP con TLS mediante un servidor local y certificado temporal; `SMTP_CA_FILE` es exclusivo de pruebas o desarrollo.

`POST /auth/forgot-password` devuelve una respuesta uniforme; `POST /auth/validate-reset` valida el token y `POST /auth/reset-password` consume el token y revoca sesiones. `/auth/password` cambia la contraseña con la anterior; `/auth/sessions` lista las sesiones propias y `/auth/sessions/revoke-others` y `/auth/sessions/:id/revoke` requieren contraseña. Los tokens nunca se escriben en respuestas públicas de recuperación.
