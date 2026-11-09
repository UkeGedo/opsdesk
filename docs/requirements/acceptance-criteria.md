# Casos de uso y criterios

En todos los casos el backend comprueba sesión, rol y alcance de recurso; datos inválidos producen 400/422 sin cambios; falta de sesión 401 y permisos insuficientes 403 (o 404 para evitar revelar recursos). Los flujos indicados son objetivos futuros.

| Caso                     | Flujo principal                                   | Alternativas y errores                                                            |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Iniciar sesión           | Introducir credenciales, validar y crear sesión   | Credenciales inválidas o usuario inactivo: respuesta uniforme; limitar intentos   |
| Registrar cliente        | Personal autorizado introduce datos y confirma    | Correo duplicado o datos inválidos: error contextual, sin escritura               |
| Crear ticket             | Cliente autorizado introduce asunto y descripción | Validación fallida conserva entrada; error de persistencia no crea ticket parcial |
| Asignar técnico          | Supervisor selecciona técnico activo y confirma   | Técnico inactivo o conflicto: rechazar y conservar asignación previa              |
| Cambiar estado           | Técnico asignado selecciona transición permitida  | Estado obsoleto o transición inválida: rechazar y actualizar vista                |
| Resolver incidencia      | Técnico aporta solución y confirma resolución     | Solución vacía o sin asignación: rechazar                                         |
| Consultar historial      | Participante autorizado abre cambios visibles     | Cliente no recibe comentarios internos ni historial ajeno                         |
| Movimiento de inventario | Administrador indica producto, cantidad y motivo  | Cantidad inválida o saldo negativo: rechazar transacción                          |
| Consultar indicadores    | Supervisor elige intervalo y consulta             | Intervalo inválido: error; sin datos: estado vacío                                |
| Administrar usuarios     | Administrador crea, cambia rol o desactiva        | Duplicado, último administrador o permisos insuficientes: rechazar                |
