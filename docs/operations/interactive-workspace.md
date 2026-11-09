# Espacio interactivo: alcance actual

La barra de búsqueda abre una paleta con Ctrl+K o Cmd+K cuando el foco no está en un campo de edición. También se puede abrir con el botón «Buscar». La consulta espera 300 ms y busca tickets, clientes y activos a través de la API, según el rol. Tab recorre los resultados y Escape cierra la ventana. La API sigue siendo responsable de autorizar cada consulta.

La vista rápida de tickets conserva la lista y codifica la selección en la URL. Los administradores y supervisores pueden modificar prioridad o asignación, con control de concurrencia. Se pueden actualizar prioridades en varios tickets visibles: cada petición se valida de manera independiente y se informan los errores individuales. Las fichas de cliente y las ventanas de edición y creación usan un diálogo nativo; el cierre de formularios modificados pide confirmación y la selección de «seguir editando» conserva los campos.

La barra de pestañas recuerda hasta ocho rutas durante la sesión de la interfaz, sin duplicarlas; la URL de tickets conserva búsqueda, página y filtros. El navegador guarda la densidad y las columnas de tickets, el ancho de los paneles, el orden de los bloques del panel, el tema y el estado de la barra lateral. Los bloques del panel se pueden reorganizar arrastrando su control o usando los botones de movimiento.

## Límites pendientes

La protección de cambios cubre las ventanas nuevas; no todos los formularios antiguos advierten antes de navegar dentro de la aplicación. Las pestañas no conservan formularios ni el estado interno de todos los módulos, y no se restauran después de recargar. Todavía no hay vista maestro-detalle redimensionable, menús contextuales para todos los módulos, paneles de historial y activos, ni un sistema general de notificaciones emergentes. Las acciones masivas están limitadas a prioridad de tickets; el reordenamiento por arrastre solo cambia la presentación local del panel. No se ha realizado una evaluación completa con lectores de pantalla.
