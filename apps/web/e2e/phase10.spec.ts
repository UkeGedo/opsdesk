import { expect, test } from '@playwright/test';

test('catálogo, matriz, política SLA y respuesta en una solicitud', async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  const base = process.env.E2E_BASE_URL;
  if (
    !base ||
    !['localhost', '127.0.0.1'].includes(new URL(base).hostname) ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !process.env.E2E_PASSWORD
  )
    throw new Error('Se requiere un entorno aislado local.');
  const serviceName = `Soporte de prueba ${Date.now()}`;
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('admin@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await page.goto('/tickets');
  await page.getByText('Catálogo de servicios', { exact: true }).click();
  const catalog = page.locator('details').filter({ hasText: 'Catálogo de servicios' });
  await catalog.getByLabel('Nombre del servicio').fill(serviceName);
  await catalog.getByLabel('Descripción del servicio').fill('Atención de equipos');
  await catalog.getByLabel('Categoría del servicio').selectOption({ label: 'Conectividad' });
  await catalog.getByLabel('Equipo responsable').fill('Equipo de soporte');
  await catalog
    .getByLabel('Campos adicionales (JSON)')
    .fill(
      '[{"key":"equipo","label":"Equipo afectado","type":"text","required":true,"maxLength":120}]',
    );
  await catalog.getByRole('button', { name: 'Guardar servicio' }).click();
  await expect(catalog.getByText('Servicio guardado.')).toBeVisible();
  await catalog.locator('summary').click();
  await page.getByText('Matriz de impacto y urgencia', { exact: true }).click();
  const matrix = page.locator('details').filter({ hasText: 'Matriz de impacto y urgencia' });
  await matrix.getByRole('button', { name: /Configurar matriz|Editar matriz/ }).click();
  await matrix.getByRole('button', { name: 'Guardar matriz' }).click();
  await expect(matrix.getByText(/Versión vigente: \d+/)).toBeVisible();
  await matrix.locator('summary').click();
  await page.getByText('Configurar acuerdos de servicio', { exact: true }).click();
  const policies = page.locator('details').filter({ hasText: 'Configurar acuerdos de servicio' });
  await policies.getByLabel('Nombre del acuerdo').fill('SLA de prueba');
  await policies.getByLabel('Servicio aplicable').selectOption({ label: serviceName });
  await policies.getByRole('button', { name: 'Guardar política' }).click();
  await expect(policies.getByText('Política creada.')).toBeVisible();
  await policies.locator('summary').click();
  const form = page.locator('main');
  await form.getByRole('combobox', { name: 'Cliente', exact: true }).selectOption({ index: 1 });
  await form
    .getByRole('combobox', { name: 'Categoría', exact: true })
    .selectOption({ label: 'Conectividad' });
  await form
    .getByRole('combobox', { name: 'Servicio', exact: true })
    .selectOption({ label: serviceName });
  await form.getByLabel('Equipo afectado').fill('Portátil 1');
  await form.getByRole('textbox', { name: 'Asunto', exact: true }).fill('Fallo de prueba');
  await form.getByLabel('Descripción', { exact: true }).fill('No hay conexión');
  await form.getByRole('combobox', { name: 'Impacto' }).selectOption('alta');
  await form.getByRole('combobox', { name: 'Urgencia' }).selectOption('media');
  await form.getByRole('button', { name: 'Crear ticket' }).click();
  await expect(page.getByRole('heading', { name: 'Fallo de prueba' })).toBeVisible();
  await expect(page.getByText('Portátil 1')).toBeVisible();
  await expect(page.getByText('Política aplicada · versión 1')).toBeVisible();
  await page.getByText('Respuestas predefinidas', { exact: true }).click();
  const templates = page.locator('details').filter({ hasText: 'Respuestas predefinidas' });
  await templates.getByLabel('Nombre de plantilla').fill('Revisión inicial');
  await templates.getByLabel('Texto de plantilla').fill('Revisaremos tu solicitud.');
  await templates.getByRole('button', { name: 'Guardar plantilla' }).click();
  await expect(templates.getByText('Plantilla guardada.')).toBeVisible();
  await templates.getByRole('button', { name: 'Insertar' }).click();
  await expect(page.getByLabel('Añadir comentario')).toHaveValue('Revisaremos tu solicitud.');
  await page.getByRole('button', { name: 'Enviar comentario' }).click();
  await expect(page.getByText('Comentario añadido.')).toBeVisible();
  await expect(page.getByLabel('Acuerdo de servicio').getByText('Cumplido')).toBeVisible();
});
