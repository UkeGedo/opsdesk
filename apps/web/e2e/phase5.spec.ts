import { test, expect, type Browser, type Page } from '@playwright/test';
const password = process.env.E2E_PASSWORD ?? '';
function requireIsolated() {
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  const base = process.env.E2E_BASE_URL;
  if (
    !password ||
    !base ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)
  )
    throw new Error(
      'Use solo datos aislados locales: configure E2E_BASE_URL, E2E_PASSWORD y E2E_ISOLATED=yes.',
    );
}
test.setTimeout(90000);
async function login(browser: Browser, email: string) {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const page = await context.newPage();
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  return { page, context };
}
async function status(page: Page, value: string) {
  await page.getByLabel('Cambiar estado').selectOption(value);
  if (value === 'resuelto')
    await page.getByLabel('Solución').fill('Solución comprobada por la prueba.');
  const response = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/api/v1/tickets/'),
  );
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Estado actualizado' })).toBeVisible();
}
test('administrador registra y edita un cliente', async ({ browser }) => {
  requireIsolated();
  const admin = await login(browser, 'admin@example.test');
  const name = `Cliente prueba ${Date.now()}`;
  try {
    await admin.page.goto('/clientes');
    const pagination = admin.page.getByRole('navigation', { name: 'Paginación de clientes' });
    await expect(pagination.getByText('Página 1', { exact: false })).toBeVisible();
    await pagination.getByRole('button', { name: 'Siguiente' }).click();
    await expect(pagination.getByText('Página 2', { exact: false })).toBeVisible();
    await pagination.getByRole('button', { name: 'Anterior' }).click();
    await expect(pagination.getByText('Página 1', { exact: false })).toBeVisible();
    const create = admin.page.locator('section').filter({
      has: admin.page.getByRole('heading', { name: 'Registrar cliente', exact: true }),
    });
    await create.getByLabel('Nombre', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Registrar cliente' }).click();
    await expect(create.getByRole('status')).toContainText('Cliente registrado');
    await admin.page.getByLabel('Buscar clientes').fill(name);
    await admin.page.getByRole('button', { name: `Editar ${name}` }).click();
    const otherPage = await admin.context.newPage();
    await otherPage.goto('/clientes');
    await otherPage.getByLabel('Buscar clientes').fill(name);
    await otherPage.getByRole('button', { name: `Editar ${name}` }).click();
    await admin.page.getByLabel('Nombre del cliente').fill(`${name} editado`);
    await admin.page.getByRole('button', { name: 'Guardar cliente' }).click();
    await expect(
      admin.page.getByRole('cell', { name: `${name} editado`, exact: true }),
    ).toBeVisible();
    await otherPage.getByLabel('Nombre del cliente').fill(`${name} sobrescrito`);
    await otherPage.getByRole('button', { name: 'Guardar cliente' }).click();
    await expect(otherPage.getByRole('alert')).toContainText('El cliente cambió');
  } finally {
    await admin.context.close();
  }
});
test('cliente crea, supervisor asigna, técnico resuelve y cliente consulta', async ({
  browser,
}) => {
  requireIsolated();
  const customer = await login(browser, 'cliente@example.test'),
    supervisor = await login(browser, 'supervisor@example.test'),
    tech = await login(browser, 'tecnico@example.test'),
    admin = await login(browser, 'admin@example.test');
  try {
    await customer.page.goto('/tickets');
    await customer.page.getByLabel('Categoría').selectOption({ label: 'Conectividad' });
    await customer.page
      .getByLabel('Asunto', { exact: true })
      .fill('Prueba integral de conectividad');
    await customer.page.getByLabel('Descripción').fill('No hay conexión en el equipo.');
    await customer.page.getByRole('button', { name: 'Crear ticket' }).click();
    await expect(customer.page).toHaveURL(/\/tickets\/[a-f0-9-]+$/);
    const url = customer.page.url();
    await supervisor.page.goto(url);
    await supervisor.page.getByLabel('Asignar técnico').selectOption({ label: 'Lucía Benavides' });
    await supervisor.page.getByRole('button', { name: 'Guardar asignación' }).click();
    await expect(supervisor.page.getByText('Asignación guardada.')).toBeVisible();
    await expect(customer.page.getByText('Asignado', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await supervisor.page.getByRole('button', { name: 'Enviar comentario' }).click();
    await expect(supervisor.page.getByText('Escribe un comentario.')).toBeVisible();
    await supervisor.page.getByLabel('Añadir comentario').fill('Seguimiento visible de prueba.');
    await supervisor.page.getByRole('button', { name: 'Enviar comentario' }).click();
    await expect(
      supervisor.page.getByRole('status').filter({ hasText: 'Comentario añadido.' }),
    ).toBeVisible();
    await expect(customer.page.getByText('Seguimiento visible de prueba.')).toBeVisible();
    await supervisor.page.getByLabel('Añadir comentario').fill('Nota interna privada de prueba.');
    await supervisor.page.getByLabel('Visibilidad').selectOption('interno');
    await supervisor.page.getByRole('button', { name: 'Enviar comentario' }).click();
    await expect(supervisor.page.getByText('Nota interna privada de prueba.')).toBeVisible();
    await customer.page.reload();
    await expect(customer.page.getByText('Seguimiento visible de prueba.')).toBeVisible();
    await expect(customer.page.getByText('Nota interna privada de prueba.')).toHaveCount(0);
    await expect(
      customer.page.getByRole('heading', { name: 'Actividad', exact: true }),
    ).toBeVisible();
    const suffix = Date.now().toString(),
      productName = `Conector ${suffix}`,
      locationName = `Bodega ${suffix}`;
    await admin.page.goto('/inventario');
    const product = admin.page
      .locator('section')
      .filter({ has: admin.page.getByRole('heading', { name: 'Nuevo producto', exact: true }) });
    await product.getByLabel('Nombre').fill(productName);
    await product.getByRole('button', { name: 'Crear producto' }).click();
    const location = admin.page
      .locator('section')
      .filter({ has: admin.page.getByRole('heading', { name: 'Nueva ubicación', exact: true }) });
    await location.getByLabel('Nombre').fill(locationName);
    await location.getByRole('button', { name: 'Crear ubicación' }).click();
    const entry = admin.page.locator('section').filter({
      has: admin.page.getByRole('heading', { name: 'Registrar movimiento', exact: true }),
    });
    await expect(
      entry.getByLabel('Producto').getByRole('option', { name: `${productName} (unidad)` }),
    ).toHaveCount(1);
    await entry.getByLabel('Producto').selectOption({ label: `${productName} (unidad)` });
    await entry.getByLabel('Destino').selectOption({ label: locationName });
    await entry.getByLabel('Cantidad').fill('3');
    await entry.getByLabel('Motivo').fill('Compra de prueba');
    await entry.getByRole('button', { name: 'Guardar movimiento' }).click();
    await expect(entry.getByRole('status')).toContainText('Movimiento registrado');
    await tech.page.goto(url);
    const consumption = tech.page
      .getByRole('heading', { name: 'Materiales utilizados', exact: true })
      .locator('..');
    await consumption
      .locator('select')
      .first()
      .selectOption({ label: `${productName} · unidad` });
    await consumption.getByLabel('Ubicación de origen').selectOption({ label: locationName });
    await consumption.getByLabel('Cantidad').fill('2');
    await consumption.getByLabel('Motivo').fill('Reparación');
    await consumption.getByRole('button', { name: 'Registrar consumo' }).click();
    await expect(consumption.getByRole('status')).toContainText('Consumo registrado');
    await expect(tech.page.getByText(/material consumido/)).toBeVisible();
    await status(tech.page, 'en_proceso');
    await customer.context.setOffline(true);
    await status(tech.page, 'resuelto');
    await customer.context.setOffline(false);
    await expect(customer.page.getByText('Solución comprobada por la prueba.')).toBeVisible({
      timeout: 15000,
    });
    await expect(customer.page.getByText('Resuelto', { exact: true })).toBeVisible();
  } finally {
    await Promise.all([
      customer.context.close(),
      supervisor.context.close(),
      tech.context.close(),
      admin.context.close(),
    ]);
  }
});
test('registra entradas y rechaza salidas superiores al stock', async ({ browser }) => {
  requireIsolated();
  const admin = await login(browser, 'admin@example.test');
  const suffix = Date.now().toString(),
    productName = `Cable ${suffix}`,
    locationName = `Depósito ${suffix}`;
  try {
    await admin.page.goto('/inventario');
    const product = admin.page
      .locator('section')
      .filter({ has: admin.page.getByRole('heading', { name: 'Nuevo producto', exact: true }) });
    await product.getByLabel('Nombre').fill(productName);
    await product.getByLabel('Stock mínimo').fill('1');
    await product.getByRole('button', { name: 'Crear producto' }).click();
    const location = admin.page
      .locator('section')
      .filter({ has: admin.page.getByRole('heading', { name: 'Nueva ubicación', exact: true }) });
    await location.getByLabel('Nombre').fill(locationName);
    await location.getByRole('button', { name: 'Crear ubicación' }).click();
    const movement = admin.page.locator('section').filter({
      has: admin.page.getByRole('heading', { name: 'Registrar movimiento', exact: true }),
    });
    await expect(
      movement.getByLabel('Producto').getByRole('option', { name: `${productName} (unidad)` }),
    ).toHaveCount(1);
    await movement.getByLabel('Producto').selectOption({ label: `${productName} (unidad)` });
    await movement.getByLabel('Destino').selectOption({ label: locationName });
    await movement.getByLabel('Cantidad').fill('2');
    await movement.getByLabel('Motivo').fill('Ingreso de prueba');
    await movement.getByRole('button', { name: 'Guardar movimiento' }).click();
    await expect(movement.getByRole('status')).toContainText('Movimiento registrado');
    await movement.getByLabel('Tipo').selectOption('salida');
    await movement.getByLabel('Origen').selectOption({ label: locationName });
    await movement.getByLabel('Cantidad').fill('3');
    await movement.getByLabel('Motivo').fill('Salida excesiva');
    await movement.getByRole('button', { name: 'Guardar movimiento' }).click();
    await expect(movement.getByRole('alert')).toContainText('Existencias insuficientes');
  } finally {
    await admin.context.close();
  }
});
