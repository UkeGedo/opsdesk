import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('inicio, anclas, tema y 404', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'La operación fluye cuando todo está en su lugar.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explorar OpsDesk' }).click();
  await expect(page).toHaveURL(/#capacidades/);
  await page.getByRole('button', { name: 'Activar tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    darkResults.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/desconocida');
  await expect(page.getByRole('heading', { name: 'Esta página no está aquí.' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL('/');
});
test('pantalla móvil 360 y accesibilidad básica', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('link', { name: 'Explorar OpsDesk' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});
