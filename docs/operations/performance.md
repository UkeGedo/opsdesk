# Medición local de rendimiento

Medición exploratoria del 8 de noviembre de 2026 en el equipo de desarrollo: Docker Desktop 29.9.2 con API Node 26.13.0 y SQLite en volumen local; generador Node 22.16.0 en Windows. Base de demostración con 61 tickets, 30 clientes y 4 productos después de los recorridos de prueba. Sin límite de CPU/memoria configurado. No se tomaron muestras de memoria ni se midió carga distribuida.

| Endpoint                       | Solicitudes | Concurrencia | Duración |    p50 |     p95 | Errores |
| ------------------------------ | ----------: | -----------: | -------: | -----: | ------: | ------: |
| `GET /api/v1/tickets?limit=20` |          80 |            4 |   0,21 s | 9,8 ms | 15,4 ms |       0 |
| `GET /api/v1/reports/summary`  |          80 |            4 |   0,16 s | 7,6 ms | 10,8 ms |       0 |

Son muestras breves de lectura en un único equipo, sin red externa ni carga sostenida; no son objetivos de servicio ni predicciones de producción. En la compilación anterior el archivo JavaScript inicial medía 562,08 kB y 170,32 kB gzip. Tras dividir por rutas, la compilación local midió 444,77 kB y 138,50 kB gzip; se cargan por separado workspace (81,40 kB), inventario (17,16 kB), tareas (8,39 kB) y gráficos (384,04 kB). Son tamaños de archivos, no tiempos de carga ni el total descargado para cada ruta.

Para repetir solo en una base ficticia aislada y local, configurar `LOAD_TEST_URL`, `LOAD_TEST_PASSWORD` y `LOAD_TEST_ACK=isolated`; ejecutar `pnpm --filter @opsdesk/api perf:smoke`. La herramienta limita concurrencia a 8 y solicitudes por endpoint a 300. No ejecutarla contra datos reales: inicia sesión y registra un evento de seguridad.
