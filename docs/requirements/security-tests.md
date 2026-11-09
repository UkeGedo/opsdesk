# Evidencia de pruebas de seguridad

La suite `apps/api/src/security.test.ts` crea una base SQLite y buzón local aislados. Comprueba credenciales inválidas e inactividad, cookie inválida, CSRF ausente/ajeno/origen, roles y pertenencia, comentarios internos, validación de campos y ordenamiento, almacenamiento de texto de script, cambio de contraseña, revocación de sesiones, recuperación de un uso y caducidad, protección de auditoría y limitación de intentos. `app.test.ts` conserva pruebas CRUD, integridad, rollback y contrato OpenAPI. Las pruebas no sustituyen una revisión independiente ni validan servicios o infraestructura que no existan.

`apps/api/src/smtp.test.ts` inicia un servidor SMTP local cifrado con un certificado efímero, comprueba entrega y consumo único del enlace. En navegador se probó el inicio real contra Docker, persistencia tras recarga, contraseña errónea y cierre de sesión. Los tests de Playwright y axe cubren acceso móvil y validaciones, además de la página pública. La prueba SMTP local no acredita la entrega a un proveedor externo específico.

El formulario de restablecimiento se comprobó en Playwright con respuestas HTTP simuladas: validación de confirmación, eliminación del fragmento de la URL y envío del token. El backend y el transporte SMTP se probaron por separado con SQLite y SMTP TLS locales.
