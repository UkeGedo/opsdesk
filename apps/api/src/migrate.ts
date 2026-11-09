import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase } from './db.js';
const { sqlite, db } = openDatabase();
try {
  migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migraciones aplicadas.');
} finally {
  sqlite.close();
}
