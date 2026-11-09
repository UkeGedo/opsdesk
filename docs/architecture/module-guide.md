# Guía para incorporar un módulo

1. Definir responsabilidad, permisos, entradas, salidas y pruebas de comportamiento; evitar depender de módulos mediante imports recíprocos.
2. Crear el módulo de negocio en `apps/api/src/modules/<nombre>` y agregar sus rutas en la composición `routes.ts`. Extraer servicio o consultas cuando exista una responsabilidad concreta; no introducir capas vacías.
3. Validar toda entrada HTTP con Zod y aplicar autorización en el servidor antes de operar sobre recursos. Reutilizar errores de `common.ts` y el identificador de solicitud. Mantener mutación y auditoría en la misma transacción.
4. Si cambia persistencia, agregar una migración Drizzle reproducible y ensayarla sobre una copia y sobre una base vacía. No borrar ni reconstruir datos existentes. Actualizar el modelo y el contrato OpenAPI.
5. Cuando proceda, agregar un tipo al contrato de `domain-events.ts` y publicarlo tras confirmar la transacción. No basar operaciones críticas en esas señales no persistentes; usar un mecanismo durable si se requiere entrega garantizada.
6. Añadir componentes y consultas por funcionalidad en la interfaz; usar los tipos de `@opsdesk/shared/contracts` cuando correspondan y conservar validación de servidor independiente.
7. Ejecutar `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm check:cycles`, pruebas unitarias e integración, compilación y las pruebas de navegador afectadas. Añadir pruebas para permisos, concurrencia y transacciones cuando se alteren. La comprobación de ciclos analiza importaciones relativas estáticas y dinámicas literales de TypeScript; no analiza `require`, alias ni paquetes externos.

Los contratos compartidos actuales cubren roles, estados de cliente y ticket, datos básicos de cliente y respuestas paginadas. No contienen todos los DTO ni sustituyen los esquemas Zod de cada entrada. El código preexistente en tareas e inventario mantiene rutas con lógica de negocio y puede extraerse gradualmente bajo pruebas de regresión.
