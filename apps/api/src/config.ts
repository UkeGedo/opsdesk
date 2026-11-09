import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_PATH: z.string().min(1).default('./data/opsdesk.db'),
  APP_ORIGIN: z
    .url()
    .refine((v) => {
      const url = new URL(v);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === v;
    }, 'APP_ORIGIN debe ser un origen HTTP(S) sin ruta.')
    .default('http://127.0.0.1:5173'),
  ATTACHMENT_DIR: z.string().min(1).default('./data/attachments'),
  SESSION_MAX_MINUTES: z.coerce.number().int().min(5).max(1440).default(480),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  ATTACHMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(25 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  MAIL_MODE: z
    .enum(['disabled', 'file', 'smtp'])
    .default(process.env.NODE_ENV === 'production' ? 'disabled' : 'file'),
  MAIL_DIR: z.string().min(1).default('./data/mail'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_CA_FILE: z.string().optional(),
});
export const config = schema.parse(process.env);
if (config.SESSION_IDLE_MINUTES > config.SESSION_MAX_MINUTES)
  throw new Error('SESSION_IDLE_MINUTES no puede superar SESSION_MAX_MINUTES.');
if (config.NODE_ENV === 'production' && config.MAIL_MODE === 'file')
  throw new Error('El buzón local está deshabilitado en producción.');
if (
  config.MAIL_MODE === 'smtp' &&
  (!config.SMTP_HOST ||
    !config.SMTP_FROM ||
    Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD))
)
  throw new Error('Configuración SMTP incompleta.');

if (
  config.MAIL_MODE === 'smtp' &&
  config.NODE_ENV === 'production' &&
  !config.APP_ORIGIN.startsWith('https://')
)
  throw new Error('APP_ORIGIN debe usar HTTPS para recuperación en producción.');

if (config.NODE_ENV === 'production' && config.SMTP_CA_FILE)
  throw new Error('SMTP_CA_FILE solo está permitido en pruebas o desarrollo.');
