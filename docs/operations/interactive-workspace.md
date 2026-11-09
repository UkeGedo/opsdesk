# Espacio interactivo: alcance actual

La barra de búsqueda abre una paleta con Ctrl+K o Cmd+K cuando el foco no está en un campo de edición. También se puede abrir con el botón «Buscar». La consulta espera 300 ms y busca tickets, clientes y activos a través de la API, según el rol. Tab recorre los resultados y Escape cierra la ventana. La API sigue siendo responsable de autorizar cada consulta.

La vista rápida de tickets conserva la lista y codifica la selección en la URL. Los administradores y supervisores pueden modificar prioridad o asignación, con control de concurrencia. Se pueden actualizar prioridades en varios tickets visibles: cada petición se valida de manera independiente y se informan los errores individuales. Las fichas de cliente y las ventanas de edición y creación usan un diálogo nativo; el cierre de formularios modificados pide confirmación y la selección de «seguir editando» conserva los campos.

La barra de pestañas recuerda hasta ocho rutas durante la sesión del navegador, sin duplicarlas; la URL de tickets conserva búsqueda, página y filtros. Para evitar guardar texto de búsqueda, tras recargar se restauran las rutas, pero no las consultas de pestañas inactivas. El navegador guarda la densidad y las columnas de tickets, el ancho de los paneles, el orden de los bloques del panel, el tema y el estado de la barra lateral. Los bloques del panel se pueden reorganizar arrastrando su control o usando los botones de movimiento.

Tickets permite elegir entre un panel emergente y una vista dividida con ancho ajustable. La selección se conserva en la URL; en pantallas pequeñas los paneles se apilan. Equipos y tareas ofrecen historial en panel lateral, y los módulos de tickets, clientes, equipos y tareas cuentan con acciones contextuales. El centro de notificaciones agrupa los avisos por módulo y presenta avisos nuevos sin repetir los ya observados.

Al cambiar de ruta o cerrar el navegador, los formularios de creación de tickets, clientes, categorías y tareas, la edición de tareas, los comentarios de tickets, el perfil y las entradas principales de inventario advierten sobre cambios pendientes. Las ventanas tienen su propia confirmación al cerrarse.

## Límites pendientes

Las pestañas no conservan formularios ni el estado interno de todos los módulos. La protección de navegación no cubre todos los formularios secundarios. Las acciones masivas están limitadas a prioridad de tickets; el reordenamiento por arrastre solo cambia la presentación local del panel. No existe un módulo de órdenes en el producto actual. No se ha realizado una evaluación completa con lectores de pantalla.
