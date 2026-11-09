# Sistema visual de OpsDesk

La interfaz utiliza azul profundo en la navegación y verde petróleo para acciones y acentos, con superficies neutras y estados semánticos. La fuente de tokens está en `apps/web/src/design-system.css`; los estilos existentes se conservan y se refinan de forma incremental. Las variables cubren superficies, texto, bordes, foco, sombras, radios, espaciado, altura de controles, transición y capas. El tema oscuro define sus propias superficies y colores semánticos.

La preferencia de tema y el estado contraído de la barra lateral se guardan en el navegador. La navegación mantiene los permisos existentes; en móvil se presenta como menú y admite Escape. Los controles interactivos tienen nombres accesibles, indicador de foco y transición reducida si el sistema solicita menos movimiento.

El panel usa información procedente de la API, con acciones de acceso a solicitudes y su creación. La tabla de tickets permite ordenar y filtrar mediante la API, cambiar densidad, elegir columnas y seleccionar filas de la página para copiar sus identificadores. Las demás tablas conservan sus capacidades específicas; no todas ofrecen selección o columnas configurables. Las listas de tickets y clientes presentan estados de carga y error.

Las pruebas automatizadas comprueban seis anchuras (360, 390, 768, 1024, 1440 y 1920 píxeles), persistencia de preferencias y reglas Axe WCAG en pantallas operativas claras y oscuras. Estas pruebas no sustituyen una auditoría manual completa de WCAG 2.2 AA ni una evaluación con lectores de pantalla y usuarios reales.
