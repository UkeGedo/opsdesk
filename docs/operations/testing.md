# Pruebas y cobertura

`pnpm test` ejecuta Vitest para los paquetes; la API usa bases y buzones temporales. `pnpm --filter @opsdesk/api test:coverage` genera texto, JSON y LCOV con umbrales en `apps/api/vitest.config.js`. Medición local del 8 de noviembre de 2026 sobre ocho archivos críticos seleccionados: **85,97 % líneas, 83,19 % sentencias, 70,82 % ramas y 90,64 % funciones**. La cifra no representa todos los archivos ni una garantía de ausencia de errores. Las ramas de `domain.ts` y `tasks.ts`, y escenarios de errores operativos y concurrencia multiinstancia, necesitan más pruebas.

`pnpm test:rotation` usa archivos temporales. La batería de Playwright general usa una interfaz local y puede omitir la prueba de sesión cuando no hay credenciales aisladas. Los escenarios que modifican datos solo se activan con `PHASE5_E2E=1`, `E2E_ISOLATED=yes`, `E2E_BASE_URL` local y `E2E_PASSWORD`; deben apuntar exclusivamente a una base ficticia y descartable. Ejemplo PowerShell con Compose aislado ya inicializado:

```powershell
$env:E2E_BASE_URL = 'http://127.0.0.1:8080'
$env:E2E_PASSWORD = '<contraseña del seed aislado>'
$env:PHASE5_E2E = '1'
$env:E2E_ISOLATED = 'yes'
pnpm --filter @opsdesk/web exec playwright test e2e/phase5.spec.ts e2e/accessibility-work.spec.ts --workers=1
Remove-Item Env:E2E_PASSWORD
```

Los escenarios cubren creación y edición concurrente de clientes, comentarios públicos e internos, sesión invalidada, fallo de red simulado, cliente, supervisor y técnico, consumo de materiales, resolución, desconexión y recuperación, y rechazo de stock insuficiente. Axe comprueba cinco vistas operativas; también se verifica ausencia de desbordamiento a 360 px y que Tab alcance un elemento. Esto no sustituye una revisión completa de teclado, contraste manual, zoom, lectores de pantalla o usuarios reales.

CI instala con lockfile, ejecuta formato, lint, tipos, pruebas, cobertura, auditoría de producción, compilación, Playwright e imágenes. Publica informes cuando existen y usa credenciales aleatorias y datos efímeros en el entorno de Compose. La ejecución alojada requiere GitHub Actions, registro de paquetes, imágenes y navegador; no se afirma que haya corrido en GitHub sin un run verificable.
