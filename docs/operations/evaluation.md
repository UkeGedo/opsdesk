# Evaluación final de calidad — 8 de noviembre de 2026

Esta evaluación describe las comprobaciones realizadas en un entorno local aislado. No es una certificación, un despliegue público ni una garantía de funcionamiento bajo cargas de producción.

## Resultados verificados

- TypeScript y las comprobaciones de calidad del repositorio; la compilación y las pruebas completas requieren acceso al entorno local cuando el sandbox de Windows impide que esbuild lea la configuración de Vite.
- 44 pruebas automatizadas de API y una prueba de rotación de copias. La cobertura de los módulos críticos seleccionados fue 85,99 % de líneas, 83,14 % de sentencias, 71,01 % de ramas y 90,44 % de funciones. No representa la cobertura de todo el repositorio.
- Imagen Linux de producción: migraciones, semilla ficticia, arranque sin privilegios, comprobación de preparación, persistencia tras reinicio y ausencia de Vitest. Las pruebas de navegador usan exclusivamente una base local aislada: abarcan acceso, tickets entre roles, asignación, resolución, reconexión, inventario, creación y edición de clientes y comprobaciones automatizadas de accesibilidad.
- Los 11 recorridos Playwright pasaron contra la versión actualizada en Compose. Se corrigió el foco de teclado en un gráfico oculto a lectores de pantalla, conservando la lista textual de datos. La prueba de accesibilidad espera a que el gráfico esté cargado antes de ejecutar axe.
- Una copia SQLite en WAL se restauró y verificó con una base de prueba. La retención es simulada por defecto y tiene una prueba que comprueba su alcance. Los adjuntos requieren una copia coordinada independiente.
- La auditoría de dependencias de producción no encontró vulnerabilidades conocidas altas o críticas en el momento de la comprobación. En dependencias de desarrollo quedaron dos alertas moderadas, en esbuild y minimatch; se deben revisar al actualizar dependencias.
- Las mediciones de respuesta y el tamaño del bundle figuran en [rendimiento](performance.md). Son una muestra breve local con datos ficticios, no una prueba de capacidad de producción.

Se inspeccionaron visualmente el panel y el inventario en navegador y sus capturas; la prueba automatizada revisó cinco vistas y un ancho de 360 px. No se ha completado una auditoría visual manual de todas las pantallas. Los recorridos comprueban fallo de red simulado, sesión invalidada mediante eliminación de la cookie, validaciones de acceso y comentarios, e historial; no agotan todos los errores operativos ni sustituyen una revisión manual completa.

## Hallazgos y trabajo externo pendiente

| Prioridad                | Pendiente                           | Impacto y acción                                                                                                           |
| ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Alta antes de producción | HTTPS, dominio y despliegue real    | Configurar un proxy TLS y un servidor seguro; aquí solo se probó Compose en loopback.                                      |
| Alta antes de producción | Copias operativas                   | Programar y supervisar copias cifradas externas de base y adjuntos y ensayar restauraciones periódicas en el destino real. |
| Alta antes de producción | Revisión de seguridad independiente | Revisar la [matriz ASVS parcial](security-asvs.md), MFA, secretos, permisos y el entorno final; no hay certificación ASVS. |
| Media                    | Accesibilidad manual                | Evaluar lector de pantalla, zoom, navegación completa y usuarios reales; axe automatizado no demuestra conformidad WCAG.   |
| Media                    | CI y notificaciones reales          | GitHub Actions pasó para el commit `a0dd73c`; falta configurar y probar un proveedor SMTP real.                            |
| Media                    | Rendimiento                         | Evaluar con datos y carga representativos; la reducción del bundle no es una prueba de capacidad.                          |
| Media                    | Gestión de auditoría                | Definir retención, acceso, revisión y almacenamiento centralizado de registros.                                            |

La demostración utiliza datos y credenciales ficticios. No se debe utilizar la semilla en producción. Véanse [despliegue](deployment.md), [copias](backups.md), [pruebas](testing.md) y [guion de demo](../portfolio/demo.md).

La interfaz envía una versión al editar clientes y detecta conflictos. Por compatibilidad, los clientes antiguos de la API que omitan `expectedUpdatedAt` no cuentan con esa protección y deben actualizarse. La edición parcial conserva el estado existente.
