import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('acceso accesible, validaciones y rutas protegidas', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/acceso$/);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText('Introduce un correo válido.')).toBeVisible();
  await expect(page.getByText('Introduce tu contraseña.')).toBeVisible();
  const findings = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    findings.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: 'Recupera tu acceso' })).toBeVisible();
  await page.goto('/perfil');
  await expect(page).toHaveURL(/\/acceso$/);
});

test('un fallo de red al iniciar sesión muestra un mensaje comprensible', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) => route.abort('failed'));
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('demo@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('contraseña-ficticia');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.',
  );
  await expect(page).toHaveURL(/\/acceso$/);
});

test('acceso y recuperación protegen los campos antes de cambiar de ruta', async ({ page }) => {
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('demo@example.test');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  const warning = page.getByRole('dialog', { name: 'Cambios sin guardar' });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('demo@example.test');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await warning.getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/recuperar$/);
});

test('sesión vencida exige volver a iniciar sesión', async ({ page }) => {
  const base = process.env.E2E_BASE_URL;
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  if (
    !base ||
    !['127.0.0.1', 'localhost'].includes(new URL(base).hostname) ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !process.env.E2E_PASSWORD
  )
    throw new Error('La prueba requiere credenciales y un entorno local aislado.');
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('admin@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await page.context().clearCookies();
  await page.goto('/clientes');
  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.getByRole('alert')).toContainText('Tu sesión no está activa');
});

test('sesión vencida conserva el formulario pendiente para poder copiarlo', async ({ page }) => {
  const base = process.env.E2E_BASE_URL;
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  if (
    !base ||
    !['127.0.0.1', 'localhost'].includes(new URL(base).hostname) ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !process.env.E2E_PASSWORD
  )
    throw new Error('La prueba requiere un entorno local aislado.');
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('admin@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await page.getByLabel('Asunto', { exact: true }).fill('Borrador que debe conservarse');
  await page.route('**/api/v1/tickets?*', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sesión vencida' } }),
    }),
  );
  await page.getByLabel('Buscar tickets').fill('forzar consulta');
  await expect(page.getByRole('alert').filter({ hasText: 'Tu sesión venció' })).toBeVisible();
  await expect(page.getByLabel('Asunto', { exact: true })).toHaveValue(
    'Borrador que debe conservarse',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/acceso$/);
});

test('sesión real conserva acceso, valida contraseña y cierra sesión', async ({ page }) => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    'Requiere API aislada y credenciales efímeras.',
  );
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await page.getByRole('link', { name: /Mi perfil/ }).click();
  await expect(page.getByRole('heading', { name: 'Tu perfil' })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((cookie) =>
    ['__Host-opsdesk_session', 'opsdesk_session'].includes(cookie.name),
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  if (sessionCookie?.name === '__Host-opsdesk_session') expect(sessionCookie.secure).toBe(true);
  expect(sessionCookie?.sameSite).toBe('Strict');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tu perfil' })).toBeVisible();
  await page.getByLabel('Contraseña actual').fill('contraseña-incorrecta');
  await page.getByLabel('Nueva contraseña').fill('otra-contraseña-larga-123');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('Credenciales inválidas.');
  await expect(page.getByRole('heading', { name: 'Tu perfil' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/acceso$/);
});

test('restablecimiento retira el token de la URL y valida la confirmación', async ({ page }) => {
  let submitted: unknown;
  await page.route('**/api/v1/auth/validate-reset', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/auth/reset-password', async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 204 });
  });
  const token = 'a'.repeat(43);
  await page.goto(`/restablecer#${token}`);
  await expect(page.getByLabel('Nueva contraseña')).toBeVisible();
  await expect(page).not.toHaveURL(/#/);
  await page.getByLabel('Nueva contraseña').fill('contraseña-ejemplo-123');
  await page.getByLabel('Confirmar contraseña').fill('contraseña-distinta-123');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await page.getByLabel('Confirmar contraseña').fill('contraseña-ejemplo-123');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('Contraseña actualizada.');
  expect(submitted).toEqual({ token, newPassword: 'contraseña-ejemplo-123' });
});
