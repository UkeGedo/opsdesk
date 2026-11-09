import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rotateBackups } from './rotate-backups.mjs';
test('la rotación es simulada por defecto y elimina solo copias con el patrón previsto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opsdesk-rotation-'));
  try {
    for (const name of [
      'opsdesk-20261101T000000Z.db',
      'opsdesk-20261102T000000Z.db',
      'opsdesk-20261103T000000Z.db',
      'otro.db',
    ])
      await writeFile(join(dir, name), 'test');
    const dry = await rotateBackups(dir, 2);
    assert.deepEqual(dry.candidates, ['opsdesk-20261101T000000Z.db']);
    assert.equal((await readdir(dir)).length, 4);
    await rotateBackups(dir, 2, true);
    assert.deepEqual((await readdir(dir)).sort(), [
      'opsdesk-20261102T000000Z.db',
      'opsdesk-20261103T000000Z.db',
      'otro.db',
    ]);
    await assert.rejects(() => rotateBackups(dir, 0));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
