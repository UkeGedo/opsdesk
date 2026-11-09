import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runConfig(max: string, idle: string) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import { config } from './src/config.ts'; console.log(JSON.stringify([config.SESSION_MAX_MINUTES, config.SESSION_IDLE_MINUTES]))",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SESSION_MAX_MINUTES: max,
        SESSION_IDLE_MINUTES: idle,
      },
      encoding: 'utf8',
    },
  );
}
describe('configuración de sesiones', () => {
  it('acepta límites válidos', () => {
    const result = runConfig('120', '15');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('[120,15]');
  });
  it('rechaza una inactividad superior a la vida total', () => {
    const result = runConfig('30', '31');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SESSION_IDLE_MINUTES no puede superar SESSION_MAX_MINUTES');
  });
});
