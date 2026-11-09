import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.DEMO_URL;
const password = process.env.DEMO_PASSWORD;
if (!url || !password)
  throw new Error(
    'DEMO_URL y DEMO_PASSWORD son obligatorios. Utilice solo un entorno ficticio aislado.',
  );
const origin = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(origin.hostname))
  throw new Error('La captura automatizada solo admite demostraciones locales.');
const out = resolve(process.cwd(), '../../docs/assets');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
);
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.goto(new URL('/acceso', origin).href);
  await page.getByLabel('Correo electrónico').fill('admin@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/panel');
  await page.getByRole('heading', { name: 'Indicadores de tickets' }).waitFor();
  await page.getByRole('heading', { name: 'Creación por día' }).waitFor();
  await page.screenshot({ path: resolve(out, 'panel-demo.png') });
  await page.goto(new URL('/inventario', origin).href);
  await page.getByText('Cable de red', { exact: true }).first().waitFor();
  await page.screenshot({ path: resolve(out, 'inventario-demo.png') });
} finally {
  await browser.close();
}
