import { createServer } from 'node:http';
import { realtime } from './realtime.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import pino from 'pino';
import { cleanExpiredSessions } from './modules/identity/auth.js';
const logger = pino();
const { sqlite, db } = openDatabase();
// Migrations are an explicit deployment step, never destructive startup synchronization.
cleanExpiredSessions(db);
const cleanupTimer = setInterval(() => cleanExpiredSessions(db), 24 * 60 * 60 * 1000);
cleanupTimer.unref();
let publish: ReturnType<typeof realtime>['publish'] = () => {};
const server = createServer(createApp(db, { publish: (change) => publish(change) }));
const socket = realtime(server, db);
publish = socket.publish;
server.listen(config.PORT, () => logger.info({ port: config.PORT }, 'API iniciada'));
function shutdown() {
  clearInterval(cleanupTimer);
  void socket.close().then(() => {
    sqlite.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
