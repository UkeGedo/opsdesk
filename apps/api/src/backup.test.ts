import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { backupDatabase } from './backup-service.js';
const dir = mkdtempSync(join(tmpdir(), 'opsdesk-restore-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
it('restaura una copia consistente de SQLite con WAL y rechaza sobrescrituras', async () => {
  const source = join(dir, 'source.db'),
    copy = join(dir, 'backup.db');
  const db = new Database(source);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE evidence (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT INTO evidence(value) VALUES (?)').run('dato persistente');
  try {
    await backupDatabase(source, copy);
    db.prepare('INSERT INTO evidence(value) VALUES (?)').run('posterior a la copia');
    const restored = new Database(copy, { readonly: true });
    try {
      expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(restored.prepare('SELECT value FROM evidence ORDER BY id').all()).toEqual([
        { value: 'dato persistente' },
      ]);
    } finally {
      restored.close();
    }
    await expect(backupDatabase(source, copy)).rejects.toThrow();
    await expect(backupDatabase(source, source)).rejects.toThrow();
  } finally {
    db.close();
  }
});
