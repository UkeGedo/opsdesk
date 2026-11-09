import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('ventanas, búsqueda global y contexto de tickets', async ({ page }) => {
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  const base = process.env.E2E_BASE_URL;
  if (
    !base ||
    !['localhost', '127.0.0.1'].includes(new URL(base).hostname) ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !process.env.E2E_PASSWORD
  )
    throw new Error('Se requiere un entorno aislado local.');
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('admin@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mover actividad antes' }).click();
  await expect(page.locator('.dashboard-widget').first()).toContainText('Actividad reciente');
  await page
    .locator('.dashboard-widget')
    .last()
    .locator('[draggable="true"]')
    .dragTo(page.locator('.dashboard-widget').first().locator('.widget-controls'));
  await expect(page.locator('.dashboard-widget').first()).toContainText('Indicadores de tickets');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Buscar y ejecutar acciones' });
  await expect(palette).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations.map((entry) => entry.id),
  ).toEqual([]);
  await palette.getByLabel('Buscar en OpsDesk').fill('conectividad');
  await expect(palette.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await page.getByLabel('Buscar tickets').fill('conectividad');
  const actions = page.getByRole('button', { name: /Acciones del ticket/ }).first();
  await actions.click();
  await expect(page.getByRole('button', { name: 'Abrir vista rápida' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(actions).toBeFocused();
  await expect(page.getByRole('button', { name: 'Abrir vista rápida' })).toBeHidden();
  await expect(page.getByRole('button', { name: /Vista rápida ticket/ }).first()).toBeVisible();
  await page
    .getByRole('button', { name: /Vista rápida ticket/ })
    .first()
    .click();
  const drawer = page.getByRole('dialog', { name: 'Vista rápida de ticket' });
  await expect(drawer).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations.map((entry) => entry.id),
  ).toEqual([]);
  await expect(page).toHaveURL(/ticket=/);
  await drawer.getByLabel('Modificar prioridad').selectOption('alta');
  await page.keyboard.press('Escape');
  await expect(drawer.getByText('¿Descartar los cambios sin guardar?')).toBeVisible();
  await drawer.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(drawer.getByLabel('Modificar prioridad')).toHaveValue('alta');
  await drawer.getByRole('button', { name: 'Cerrar ventana' }).click();
  await drawer.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByLabel('Buscar tickets')).toHaveValue('conectividad');
  await expect(page).not.toHaveURL(/ticket=/);
  await page.getByRole('button', { name: 'Vista compacta' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Vista cómoda' })).toBeVisible();
  await expect(page.getByLabel('Buscar tickets')).toHaveValue('conectividad');
  await page.getByRole('button', { name: 'Nueva solicitud en ventana' }).click();
  const create = page.getByRole('dialog', { name: 'Nueva solicitud' });
  await create.getByLabel('Asunto', { exact: true }).fill('Cambio de prueba');
  await page.keyboard.press('Escape');
  await expect(create.getByText('¿Descartar los cambios sin guardar?')).toBeVisible();
  await create.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(create).toBeHidden();
  await page
    .getByRole('checkbox', { name: /Seleccionar ticket/ })
    .first()
    .check();
  await page.getByLabel('Prioridad para seleccionados').selectOption('alta');
  await page.getByRole('button', { name: 'Actualizar prioridad' }).click();
  await page.getByRole('button', { name: 'Confirmar actualización' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '1 actualizados; 0 con error' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar cliente en ventana' }).click();
  const customer = page.getByRole('dialog', { name: 'Registrar cliente' });
  await customer.getByLabel('Nombre', { exact: true }).fill('Formulario sin guardar');
  await customer.getByRole('button', { name: 'Cerrar ventana' }).click();
  await expect(customer.getByText('¿Descartar los cambios sin guardar?')).toBeVisible();
  await customer.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(customer.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Formulario sin guardar',
  );
  await customer.getByRole('button', { name: 'Cerrar ventana' }).click();
  await customer.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(customer).toBeHidden();
});

test('la búsqueda y vista rápida respetan el rol de cliente', async ({ page }) => {
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  const base = process.env.E2E_BASE_URL;
  if (
    !base ||
    !['localhost', '127.0.0.1'].includes(new URL(base).hostname) ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !process.env.E2E_PASSWORD
  )
    throw new Error('Se requiere un entorno aislado local.');
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('cliente@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Buscar y ejecutar acciones' });
  await expect(palette.getByRole('link', { name: 'Clientes', exact: true })).toHaveCount(0);
  await expect(palette.getByRole('link', { name: 'Inventario', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await page
    .getByRole('button', { name: /Vista rápida ticket/ })
    .first()
    .click();
  const drawer = page.getByRole('dialog', { name: 'Vista rápida de ticket' });
  await expect(drawer.getByLabel('Modificar prioridad')).toHaveCount(0);
  await expect(drawer.getByLabel('Asignar técnico')).toHaveCount(0);
});

test('vista dividida, pestañas y protección de navegación', async ({ page }) => {
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  const base = process.env.E2E_BASE_URL;
  if (
    !base ||
    !['localhost', '127.0.0.1'].includes(new URL(base).hostname) ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !process.env.E2E_PASSWORD
  )
    throw new Error('Se requiere un entorno aislado local.');
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('admin@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await page.getByLabel('Buscar tickets').fill('conectividad');
  await page.getByRole('button', { name: 'Usar vista dividida' }).click();
  await page
    .getByRole('button', { name: /Vista rápida ticket/ })
    .first()
    .click();
  await expect(page.getByRole('complementary', { name: 'Detalle seleccionado' })).toBeVisible();
  await expect(page.getByLabel('Buscar tickets')).toHaveValue('conectividad');
  await expect(page).toHaveURL(/ticket=/);
  await page.getByRole('button', { name: 'Cerrar detalle seleccionado' }).click();
  await page.getByLabel('Asunto', { exact: true }).fill('Sin guardar');
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  const warning = page.getByRole('dialog', { name: 'Cambios sin guardar' });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.getByLabel('Asunto', { exact: true })).toHaveValue('Sin guardar');
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  await warning.getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await page.reload();
  await expect(
    page
      .getByRole('navigation', { name: 'Pestañas de trabajo' })
      .getByRole('button', { name: 'Tickets', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Tareas', exact: true }).click();
  await page.getByRole('button', { name: 'Ver historial', exact: true }).first().click();
  const history = page.getByRole('dialog', { name: 'Historial de tarea' });
  await expect(history).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await page.getByRole('link', { name: 'Mi perfil' }).click();
  await page.getByLabel('Nombre completo').fill('Nombre sin guardar');
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  const profileWarning = page.getByRole('dialog', { name: 'Cambios sin guardar' });
  await expect(profileWarning).toBeVisible();
  await profileWarning.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Nombre sin guardar');
});
