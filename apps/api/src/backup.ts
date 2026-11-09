import { z } from 'zod';
import { config } from './config.js';
import { backupDatabase } from './backup-service.js';
const destination = z.string().min(1).parse(process.env.BACKUP_PATH);
await backupDatabase(config.DATABASE_PATH, destination);
console.log('Copia SQLite creada y verificada.');
