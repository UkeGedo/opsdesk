# OpsDesk para portafolio

## Resumen ejecutivo

OpsDesk reúne en una aplicación de una sola instancia la atención de solicitudes, la asignación de técnicos y el control de materiales. El problema abordado es la pérdida de contexto cuando tickets, tareas y consumos se registran por separado. La solución conserva la relación entre trabajo, responsable, historial e inventario, sin atribuir resultados comerciales ni usuarios reales al proyecto.

## Qué demostrar

- Un cliente crea una solicitud; un supervisor asigna a un técnico; el técnico registra consumo, documenta la solución y el cliente consulta el resultado.
- Las salidas de inventario no permiten saldo negativo y una clave de idempotencia evita descontar dos veces un reintento.
- La interfaz limita las opciones por rol y el servidor vuelve a comprobar sesión y acceso por recurso.
- Las notificaciones se guardan en SQLite; Socket.IO solo indica cambios y la API reconstruye el estado al reconectar.
- Un panel resume datos visibles y permite exportar CSV con filtros, límite y protección ante fórmulas.

## Diseño y decisiones

React/TypeScript con consultas cacheadas; API Express/TypeScript con Zod y Drizzle; SQLite en WAL para una instancia escritora; Socket.IO autenticado; pruebas con Vitest, Supertest, Playwright y Axe. Los archivos se guardan en un directorio privado y se sirven tras autorización. Se eligió un monolito modular porque el alcance inicial no exige coordinación distribuida. La decisión implica límites de concurrencia y despliegue multiinstancia, documentados en [despliegue](../operations/deployment.md).

## Retos técnicos y evidencias

- Operaciones atómicas y recuperación: pruebas de stock insuficiente, reintento, solicitudes simultáneas y rollback de auditoría; copia SQLite con restauración de prueba.
- Concurrencia: versiones para tickets, productos, tareas y activos; conflictos se devuelven de forma controlada.
- Aislamiento: pruebas negativas de roles, IDOR, CSRF, notas internas, archivos y CSV.
- Experiencia: captura real del [panel](../assets/panel-demo.png) y del [inventario](../assets/inventario-demo.png), con datos ficticios; Axe en cinco vistas operativas.
- Medición real y acotada: resultados y límites en [rendimiento](../operations/performance.md); cobertura de archivos críticos en [pruebas](../operations/testing.md).

## Aprendizajes y siguientes pasos

Definir qué datos son fuente de verdad, limitar señales en tiempo real y probar fallos transaccionales es tan importante como construir las pantallas. Para evolución: validación independiente de seguridad y accesibilidad, migración a base cliente-servidor si se requiere alta concurrencia o varias instancias, procesamiento durable de correo, copias externas automatizadas y reducción adicional del bundle. El proyecto no incluye demostración pública ni certificación ASVS.
