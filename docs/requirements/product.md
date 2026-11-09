# Producto y requisitos

## Problema y propósito

Los equipos dispersan solicitudes, asignaciones y recursos entre canales, dificultando la trazabilidad. OpsDesk busca ofrecer a una organización una fuente coherente de seguimiento. Objetivos: reducir pérdida de contexto, hacer explícita la responsabilidad y conservar decisiones; medir resultados solo cuando existan datos reales.

Público: equipos internos de soporte y operaciones y sus clientes. Alcance inicial previsto: cuentas, clientes, tickets, asignaciones, seguimiento e inventario básico. Futuro: automatizaciones, integraciones y métricas avanzadas. Sin multitenencia ni microservicios. Restricciones: Node, TypeScript, Express, React, SQLite, Drizzle; una sola organización. Riesgos: contención de escrituras SQLite, errores de autorización, exposición de comentarios internos, falta de copias verificadas y métricas sin datos suficientes.

## Roles y límites

| Rol           | Responsabilidad y necesidad                    | Operaciones prohibidas                                 |
| ------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Administrador | Configuración, usuarios, inventario y reportes | Acceder sin autorización o alterar auditoría histórica |
| Supervisor    | Coordinar y asignar, supervisar actividad      | Administrar credenciales o elevar privilegios          |
| Técnico       | Trabajar asignaciones y registrar soluciones   | Administrar usuarios o ver tickets ajenos sin permiso  |
| Cliente       | Crear y seguir sus solicitudes                 | Ver información interna o tickets de otros clientes    |

La matriz definitiva se aplicará en cada endpoint y a cada recurso; estos roles son requisitos, no permisos implementados.

## Requisitos funcionales verificables

- RF01: administrador crea, desactiva y consulta usuarios; el correo es único.
- RF02: administrador asigna un rol permitido; el backend rechaza cambios de rol por otros perfiles.
- RF03: usuario activo inicia y cierra sesión; credenciales inválidas reciben respuesta uniforme.
- RF04: administrador y supervisor registran y consultan clientes; clientes solo acceden a su propia información autorizada.
- RF05: cliente crea un ticket propio con asunto y descripción; el sistema devuelve identificador.
- RF06: supervisor asigna un técnico activo; queda registrada la asignación anterior.
- RF07: técnico asignado cambia el estado conforme a transiciones permitidas; otros reciben 403.
- RF08: participantes autorizados agregan comentarios; comentarios internos nunca son visibles al cliente.
- RF09: el historial conserva actor, fecha UTC y cambios de estado.
- RF10: administrador registra productos y activos con identificadores únicos.
- RF11: usuario autorizado registra movimientos; no se permite saldo negativo ni cantidad cero.
- RF12: usuario recibe y marca sus notificaciones; no puede consultar las de otro usuario.
- RF13: supervisor y administrador filtran indicadores por periodo y ven fuente y fecha de corte.
- RF14: operaciones sensibles generan auditoría transaccional sin secretos; no se permite editar registros.
- RF15: usuario cambia sus preferencias y zona horaria sin modificar las de otros.

## Requisitos no funcionales verificables

- RNF01 Seguridad: contraseñas Argon2id, sesiones revocables en servidor, cookie HttpOnly/Secure/SameSite y CSRF para cambios; pruebas negativas por rol y recurso.
- RNF02 Accesibilidad: referencia WCAG 2.2 AA; teclado, etiquetas, foco y contraste comprobados; registrar excepciones.
- RNF03 Rendimiento: objetivo inicial p95 de API de lectura <500 ms con 20 usuarios concurrentes sobre dataset de referencia; medir antes de comprometer SLA.
- RNF04 Disponibilidad: objetivo inicial 99,5 % mensual excluyendo mantenimiento anunciado; monitorizar y revisar según operación real.
- RNF05 Mantenibilidad: CI ejecuta tipos, lint y pruebas; módulos con límites explícitos y ADR revisables.
- RNF06 Compatibilidad: últimas dos versiones estables de Chrome, Edge, Firefox y Safari; ancho desde 360 px.
- RNF07 Integridad: claves foráneas activas, restricciones y transacciones en cambios relacionados.
- RNF08 Recuperación: copia SQLite consistente diaria y ensayo mensual de restauración; objetivos iniciales RPO 24 h y RTO 4 h, sujetos a validación.
- RNF09 Usabilidad: cada operación muestra resultado, errores contextualizados y confirmación antes de destrucción.
- RNF10 Observabilidad: eventos estructurados con correlación, sin contraseñas ni cookies; alertar por errores y fallos de backup.
