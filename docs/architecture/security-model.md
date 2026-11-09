# Seguridad y modelo de amenazas

## Alcance y amenazas

Una organización y una instancia. Activos: datos de clientes, tickets, credenciales, sesiones y auditoría. Amenazas: robo o fijación de sesión, fuerza bruta, enumeración de cuentas, CSRF, XSS, IDOR entre clientes o asignaciones, elevación de privilegios, abuso de recuperación, fuga de secretos y manipulación de auditoría. El navegador y las entradas son no confiables; el servidor y su base protegida constituyen la frontera de confianza. Las comprobaciones se ejecutan en servidor. No se afirma conformidad ni certificación ASVS.

## Matriz vigente

| Operación                      | Administrador | Supervisor | Técnico                                       | Cliente                                                           |
| ------------------------------ | ------------- | ---------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Usuarios y vinculación cliente | Sí            | No         | No                                            | No                                                                |
| Auditoría                      | Sí            | No         | No                                            | No                                                                |
| Listar/editar clientes         | Sí/Sí         | Sí/No      | No/No                                         | No/No                                                             |
| Consultar cliente concreto     | Sí            | Sí         | Datos mínimos si tiene ticket asignado        | No                                                                |
| Listar y leer tickets          | Todos         | Todos      | Asignados                                     | De su cliente vinculado                                           |
| Crear ticket                   | Sí            | Sí         | No                                            | Solo su cliente, sin asignación                                   |
| Editar y asignar ticket        | Sí            | Sí         | Solo estado permitido y solución en asignados | No                                                                |
| Comentarios                    | Sí            | Sí         | Solo asignados                                | Solo públicos de sus tickets                                      |
| Historial                      | Completo      | Completo   | Solo asignados                                | Sin notas internas ni detalle interno; incluye nombres de autores |
| Perfil y sesiones propias      | Sí            | Sí         | Sí                                            | Sí                                                                |

El administrador vincula cuentas con `PUT /api/v1/users/:id/customer`; cambiar vínculo, rol, correo o desactivar una cuenta revoca sesiones pertinentes. Las cuentas de cliente sin vínculo no ven ni crean tickets. Las consultas fuera de alcance devuelven 404 para no revelar existencia. Inventario y activos se reservan a personal interno: administradores y supervisores gestionan el catálogo y movimientos; el técnico consulta inventario, registra consumos de sus tickets y devuelve sus propios activos. Los adjuntos requieren acceso al ticket. Las notificaciones se limitan al destinatario y al recurso autorizado; los clientes no reciben avisos de notas internas. Las tareas son de personal interno y el técnico solo ve sus asignaciones y tickets accesibles.

## Autenticación, sesión y CSRF

Argon2id; correos normalizados; respuesta uniforme para credenciales incorrectas y cuenta inactiva. Limitador de login por IP y por cuenta normalizada: 10 fallos cada 15 minutos, en memoria de proceso. Token aleatorio de 256 bits; solo se almacena SHA-256. Cookie HttpOnly, SameSite Strict, Secure en producción y prefijo `__Host-` en producción; renovar al iniciar sesión invalida la cookie anterior. El cambio a este nombre de cookie requiere volver a iniciar sesiones previas de producción.

Caducidad absoluta: 8 horas; inactividad: 30 minutos, con escritura de actividad como máximo una vez por minuto. Sesiones vencidas o revocadas se eliminan tras 30 días, al inicio y diariamente. Cambio de contraseña exige la anterior y revoca las demás sesiones; recuperación revoca todas. Desactivar usuario, cambiar rol o correo y cambiar su vínculo de cliente revoca sesiones. El cierre de una o de las demás sesiones requiere contraseña actual.

CSRF utiliza un valor derivado del token aleatorio de sesión, cuya huella se almacena por sesión; `/auth/me` devuelve el valor a la aplicación autenticada sin guardar secretos en localStorage. Los cambios exigen cabecera y se rechaza `Origin` no autorizado; no se confía solo en SameSite. Peticiones sin `Origin` se admiten para clientes no navegador. CORS concede credenciales solo a `APP_ORIGIN`; `trust proxy` está deshabilitado. No se registra la cookie ni el valor CSRF.

## Recuperación y correo

El enlace usa token aleatorio de 256 bits, almacenado como huella SHA-256, válido 30 minutos y de un solo uso. El token viaja en el fragmento de URL y la aplicación lo retira del historial; no se devuelve en la respuesta HTTP. La respuesta a cuentas existentes e inexistentes es idéntica; el procesamiento se difiere, con límites por IP y cuenta. Si no hay correo configurado se devuelve 503 sin comprobar la cuenta. En desarrollo `MAIL_MODE=file` guarda mensajes en `apps/api/data/mail`, fuera de Git y del servidor web; los archivos contienen enlaces sensibles y deben protegerse y eliminarse tras la prueba. Se solicita modo 0600 en sistemas compatibles; en Windows es necesario comprobar las ACL del directorio. En producción solo se permite `smtp` o `disabled`: SMTP requiere TLS, `APP_ORIGIN` HTTPS y configuración de proveedor. La entrega asíncrona no tiene cola durable; fallos se registran sin dirección ni token. Se verificó la entrega SMTP cifrada con un servidor local de pruebas; falta validar un proveedor externo concreto con sus credenciales.

## Auditoría y otros controles

Las mutaciones de negocio registran acción, actor, recurso, resultado y fecha en su transacción; roles y desactivaciones reciben eventos específicos. Autenticaciones, recuperación, contraseñas y cierres generan eventos de seguridad; el administrador puede consultar `/api/v1/audit`. No hay endpoints para modificar registros. Definir retención y protección externa frente a manipulación directa de SQLite antes de producción.

Helmet, CSP en Nginx, Zod estricto, límites de cuerpo, SQL parametrizado, `no-store`, `no-referrer` y ausencia de `trust proxy` reducen exposición. React representa texto sin HTML arbitrario. El limitador es local al proceso; reinicio lo reinicia y no cubre varios nodos. El correo asíncrono puede perderse si el proceso se detiene; el bloqueo por IP puede afectar usuarios detrás de una NAT. Sin MFA, sin pruebas exhaustivas con lector de pantalla, sin auditoría externa y sin verificación de proveedor SMTP real. Producción requiere HTTPS, acceso restringido al archivo y al buzón, copias cifradas y monitorización.

## Referencias ASVS 5.0

- V3.2.2: React trata contenido como texto; probado con comentario que contiene etiquetas de script.
- V3.3.1 y V3.3.2: cookie `__Host-`, Secure y SameSite en producción.
- V7.2.1–V7.2.3: validación en backend y tokens de sesión aleatorios y únicos.
- V7.5.2: consulta de sesiones y revocación individual o de otras tras verificar contraseña.
- V8 (autorización): matriz y comprobaciones por recurso; solo dominios implementados.
- [OWASP ASVS 5.0](https://cornucopia.owasp.org/taxonomy/asvs-5.0) y [guía de recuperación](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). El mapeo es parcial y no implica cumplimiento completo.

## Dependencias observadas

La consulta de avisos corrigió Drizzle ORM (GHSA-gpj5-g38j-94v9) y Vitest/Tinypool (GHSA-5gmw-xhrv-c9v3 y GHSA-85c8-ppgw-ccpr). `pnpm audit --prod` no encontró avisos conocidos en el momento de la revisión. En desarrollo permanecen dos avisos moderados transitivos: esbuild usado por Drizzle Kit (GHSA-67mh-4wv8-2f99) y minimatch en herramientas de lint (GHSA-g3hv-75wg-m249). No se usan esas herramientas como servicios expuestos ni se pasan patrones de usuarios; revisar actualizaciones compatibles periódicamente. Los avisos no equivalen a una auditoría de seguridad integral.
