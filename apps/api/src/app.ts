import type { Change } from './realtime.js';
import { createDomainEventBus, type DomainEventBus } from './domain-events.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import pino from 'pino';
import helmet from 'helmet';
import type { Db } from './db.js';
import { inventoryProducts, taskNotifications, ticketAttachments, users } from './schema.js';
import { auth } from './modules/identity/auth.js';
import { errorHandler, requestId, notFound } from './common.js';
import { routes } from './routes.js';
import { rateLimit } from './security.js';
import { config } from './config.js';
import { ApiError } from './common.js';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi.js';
const requestLogger = pino({ enabled: config.NODE_ENV !== 'test' });
const requestGroups = new Set([
  'auth',
  'users',
  'customers',
  'categories',
  'service-desk',
  'tickets',
  'inventory',
  'tasks',
  'notifications',
  'reports',
  'profile',
  'audit',
]);
export function createApp(
  db: Db,
  options?: {
    attachmentDir?: string;
    publish?: (change: Change) => void;
    domainEvents?: DomainEventBus;
    onRequestLog?: (entry: {
      requestId: string;
      method: string;
      resource: string;
      status: number;
      durationMs: number;
    }) => void;
  },
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestId);
  app.set('trust proxy', false);
  app.use('/api/v1', (req, res, next) => {
    const group = req.path.split('/')[1];
    if (group === 'health' || group === 'ready') return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const entry = {
        requestId: String(res.locals.requestId),
        method: req.method,
        resource: requestGroups.has(group) ? group : 'other',
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      };
      if (options?.onRequestLog) options.onRequestLog(entry);
      else requestLogger.info(entry, 'Solicitud finalizada');
    });
    next();
  });
  app.use('/api/v1', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/api/v1', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origin !== config.APP_ORIGIN)
      return next(new ApiError(403, 'ORIGIN_INVALID', 'Origen no permitido.'));
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.vary('Origin');
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token');
      return res.status(204).end();
    }
    next();
  });
  app.use('/api/v1', rateLimit(3000, 15 * 60 * 1000));
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok', service: 'opsdesk-api' }));
  app.get('/api/v1/ready', (_req, res) => {
    try {
      db.select({ id: users.id }).from(users).limit(1).all();
      db.select({ id: inventoryProducts.id }).from(inventoryProducts).limit(1).all();
      db.select({ id: ticketAttachments.id }).from(ticketAttachments).limit(1).all();
      db.select({ id: taskNotifications.id }).from(taskNotifications).limit(1).all();
      res.json({ status: 'ready', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'unavailable' });
    }
  });
  const security = auth(db);
  app.use('/api/v1/auth', security.router);
  app.use(
    '/api/v1/docs',
    security.requireSession,
    security.admin,
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      );
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(openapi),
  );
  app.get('/api/v1/openapi.json', security.requireSession, security.admin, (_req, res) =>
    res.json(openapi),
  );
  app.use(
    '/api/v1',
    security.requireSession,
    routes(
      db,
      options?.attachmentDir,
      options?.publish,
      options?.domainEvents ?? createDomainEventBus(),
    ),
  );
  app.use((_req, _res, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}
