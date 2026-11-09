import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('vistas operativas: accesibilidad automática y navegación móvil', async ({ page }) => {
  test.skip(process.env.PHASE5_E2E !== '1', 'Requiere demostración aislada.');
  const base = process.env.E2E_BASE_URL;
  if (
    !process.env.E2E_PASSWORD ||
    !base ||
    process.env.E2E_ISOLATED !== 'yes' ||
    !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)
  )
    throw new Error('La prueba requiere una demostración aislada local.');
  test.setTimeout(150000);
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('admin@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  for (const path of ['/panel', '/tickets', '/tareas', '/inventario', '/clientes']) {
    await page.goto(path);
    await page.locator('main h1').waitFor();
    if (path === '/panel')
      await expect(page.getByRole('heading', { name: 'Creación por día' })).toBeVisible();
    const findings = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      findings.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
      `Accesibilidad ${path}`,
    ).toEqual([]);
  }
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 850 });
    for (const path of ['/panel', '/tickets', '/tareas', '/inventario', '/clientes']) {
      await page.goto(path);
      await page.locator('main h1').waitFor();
      if (
        path === '/panel' ||
        path === '/tickets' ||
        path === '/inventario' ||
        path === '/clientes'
      )
        await page.locator('main table').first().waitFor();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), {
          message: `Ancho ${width}: ${path}`,
          timeout: 5000,
        })
        .toBe(true);
    }
  }
  await page.getByRole('button', { name: 'Contraer barra lateral' }).click();
  await expect(page.getByRole('button', { name: 'Expandir barra lateral' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir barra lateral' })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir barra lateral' }).click();
  await page.getByRole('button', { name: 'Activar tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/tickets');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Ordenar por').selectOption('ticketNumber');
  await page.getByRole('combobox', { name: 'Orden', exact: true }).selectOption('asc');
  await expect(page.getByRole('button', { name: 'Vista compacta' })).toBeVisible();
  await page.getByRole('button', { name: 'Vista compacta' }).click();
  await expect(page.getByRole('button', { name: 'Vista cómoda' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('checkbox', { name: 'Seleccionar todos los tickets de esta página' })
    .check();
  await expect(page.getByText(/seleccionados en esta página/)).toBeVisible();
  await page.getByText('Columnas', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Prioridad', exact: true }).uncheck();
  await expect(page.getByRole('columnheader', { name: 'Prioridad' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Prioridad', exact: true }).check();
  const darkFindings = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    darkFindings.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    'Tema oscuro',
  ).toEqual([]);
  for (const path of ['/panel', '/tareas', '/inventario', '/clientes', '/perfil']) {
    await page.goto(path);
    await page.locator('main h1').waitFor();
    if (path === '/panel')
      await expect(page.getByRole('heading', { name: 'Creación por día' })).toBeVisible();
    const findings = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      findings.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
      `Tema oscuro ${path}`,
    ).toEqual([]);
  }
  await page.getByRole('button', { name: 'Activar tema claro' }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/inventario');
  await page.locator('main h1').waitFor();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});
