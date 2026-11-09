import { performance } from 'node:perf_hooks';
const base = process.env.LOAD_TEST_URL;
const password = process.env.LOAD_TEST_PASSWORD;
if (!base || !password || process.env.LOAD_TEST_ACK !== 'isolated')
  throw new Error('Configure LOAD_TEST_URL, LOAD_TEST_PASSWORD y LOAD_TEST_ACK=isolated.');
const parsed = new URL(base);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname))
  throw new Error('La prueba solo permite destinos locales.');
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 4),
  count = Number(process.env.LOAD_TEST_REQUESTS ?? 80);
if (
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 8 ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 300
)
  throw new Error('Límites: concurrencia 1–8, solicitudes 1–300.');
const login = await fetch(new URL('/api/v1/auth/login', parsed), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.test', password }),
  signal: AbortSignal.timeout(10000),
});
if (!login.ok) throw new Error(`No se pudo autenticar la cuenta ficticia (${login.status}).`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('No se recibió una sesión.');
async function measure(path) {
  const samples = [];
  let next = 0,
    errors = 0;
  const started = performance.now();
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= count) return;
      const t = performance.now();
      try {
        const response = await fetch(new URL(path, parsed), {
          headers: { cookie },
          signal: AbortSignal.timeout(10000),
        });
        await response.arrayBuffer();
        if (!response.ok) errors++;
      } catch {
        errors++;
      }
      samples.push(performance.now() - t);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  samples.sort((a, b) => a - b);
  const at = (p) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)];
  return {
    endpoint: path,
    requests: count,
    concurrency,
    durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
    p50Ms: Number(at(0.5).toFixed(1)),
    p95Ms: Number(at(0.95).toFixed(1)),
    errors,
  };
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      results: [
        await measure('/api/v1/tickets?limit=20'),
        await measure('/api/v1/reports/summary'),
      ],
    },
    null,
    2,
  ),
);
