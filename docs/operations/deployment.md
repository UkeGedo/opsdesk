# Despliegue de una instancia

Estado: configuración local de Compose verificada; no hay una instalación pública ni dominio configurados. La estrategia prevista es una única instancia escritora en un servidor con disco persistente, proxy TLS delante de Nginx y copias externas verificadas. SQLite no debe residir en el almacenamiento efímero de una función serverless ni en un volumen de red cuya semántica de bloqueo no se haya validado. No se ha evaluado escalado horizontal.

## Componentes

- `web`: Nginx sin privilegios, puerto interno 8080; el host publica `127.0.0.1:8080` y no lo expone directamente a Internet.
- `api`: Node sin privilegios, puerto interno 3001; no publica puertos al host. Compose espera el healthcheck antes de iniciar la interfaz.
- `opsdesk-data`: volumen local persistente montado en `/data`, con `/data/opsdesk.db` y `/data/attachments`. La base, WAL y adjuntos deben tener espacio y permisos para el usuario del contenedor.
- Ambas imágenes base están fijadas por digest. La imagen API contiene los archivos compilados, migraciones y dependencias de producción; no incluye herramientas de desarrollo.

## Primera instalación

1. Preparar DNS, servidor, firewall y terminación HTTPS externos. El proxy debe reenviar HTTP y WebSocket a `127.0.0.1:8080`. Por ejemplo, en un Caddy instalado en el servidor, `DOMINIO_REAL { reverse_proxy 127.0.0.1:8080 }` representa una configuración a adaptar; `DOMINIO_REAL` es un marcador, no una dirección de OpsDesk.
2. Configurar `APP_ORIGIN` con el origen HTTPS exacto, sin ruta, y las variables SMTP mediante un mecanismo seguro del proveedor. `MAIL_MODE=disabled` evita prometer recuperación de contraseñas por correo; para SMTP se requiere configuración y una prueba real con el proveedor.
3. Ejecutar `docker compose build` y `docker compose run --rm api node dist/migrate.js`. Las migraciones son explícitas, no se ejecutan automáticamente al arrancar.
4. Con la tabla de usuarios vacía, proporcionar `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` al proceso y ejecutar `docker compose run --rm -e BOOTSTRAP_NAME -e BOOTSTRAP_EMAIL -e BOOTSTRAP_PASSWORD api node dist/bootstrap.js`. Evitar contraseñas en argumentos, historial o archivos accesibles.
5. Ejecutar `docker compose up -d --wait`; comprobar `GET /api/v1/health` y `GET /api/v1/ready` desde un punto autorizado, iniciar sesión y verificar WebSocket y persistencia tras reiniciar.

`health` comprueba que el proceso responde. `ready` consulta SQLite y varias tablas necesarias; no verifica todas las migraciones, adjuntos, SMTP, disco libre ni servicios externos. Monitorizar también logs, espacio, errores, certificados y backups. Logs operativos estructurados se distinguen de la auditoría de negocio en SQLite.

## Actualización y límites

Respaldar base y adjuntos antes de actualizar; aplicar migraciones una sola vez y mantener una estrategia probada de restauración. No ejecutar dos escritores ni usar escalado automático horizontal. `restart: unless-stopped` reinicia los contenedores, pero no sustituye supervisión ni backups. La configuración usa cookies `Secure` en producción, por lo que HTTPS es imprescindible fuera del contexto local seguro de pruebas. Los datos y cuentas del seed son solo para entornos aislados.

Referencia: [Docker Compose en producción](https://docs.docker.com/compose/how-tos/production/).
