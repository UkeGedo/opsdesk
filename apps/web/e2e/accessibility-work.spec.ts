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
  test.setTimeout(90000);
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
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/inventario');
  await page.locator('main h1').waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});
