import Database from 'better-sqlite3';
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase } from './db.js';

export async function backupDatabase(sourcePath: string, destinationPath: string) {
  const source = resolve(sourcePath),
    destination = resolve(destinationPath);
  if (destination === source) throw new Error('El destino debe ser diferente a la base de origen.');
  if (!existsSync(source)) throw new Error('La base de origen no existe.');
  mkdirSync(dirname(destination), { recursive: true });
  const descriptor = openSync(destination, 'wx', 0o600);
  closeSync(descriptor);
  try {
    const { sqlite } = openDatabase(source);
    try {
      await sqlite.backup(destination);
    } finally {
      sqlite.close();
    }
    const copy = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      const result = copy.pragma('integrity_check', { simple: true });
      if (result !== 'ok') throw new Error('La copia no superó la comprobación de integridad.');
    } finally {
      copy.close();
    }
  } catch (error) {
    try {
      unlinkSync(destination);
    } catch {
      /* Mantener el error original; revisar el archivo incompleto. */
    }
    throw error;
  }
}
