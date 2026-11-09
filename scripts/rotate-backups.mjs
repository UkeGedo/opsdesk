import { readdir, lstat, unlink } from 'node:fs/promises';
import { resolve, join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
const namePattern = /^opsdesk-\d{8}T\d{6}Z\.db$/;
export async function rotateBackups(directory, keep, apply = false) {
  const root = resolve(directory);
  if (root === parse(root).root) throw new Error('El directorio no puede ser la raíz del sistema.');
  if (!Number.isInteger(keep) || keep < 1 || keep > 10000)
    throw new Error('La retención debe estar entre 1 y 10000 copias.');
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !namePattern.test(entry.name)) continue;
    const path = join(root, entry.name);
    const stat = await lstat(path);
    if (stat.isFile() && !stat.isSymbolicLink()) files.push(entry.name);
  }
  files.sort().reverse();
  const candidates = files.slice(keep);
  if (apply)
    for (const name of candidates) {
      const path = join(root, name);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error(`El archivo cambió durante la rotación: ${name}`);
      await unlink(path);
    }
  return { directory: root, keep, apply, candidates };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, keepArg, mode] = process.argv.slice(2);
  if (!directory || !keepArg || (mode && mode !== '--apply'))
    throw new Error('Uso: node scripts/rotate-backups.mjs DIRECTORIO CANTIDAD [--apply]');
  const result = await rotateBackups(directory, Number(keepArg), mode === '--apply');
  console.log(JSON.stringify(result, null, 2));
}
