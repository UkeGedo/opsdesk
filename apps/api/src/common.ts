import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import pino from 'pino';
const logger = pino();
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado.');
export const requestId = (_req: Request, res: Response, next: NextFunction) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  next();
};
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  let e: ApiError;
  if (error instanceof ApiError) e = error;
  else if (error instanceof ZodError)
    e = new ApiError(
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son válidos.',
      error.issues.map((i) => ({ path: i.path, message: i.message })),
    );
  else if (error instanceof Error && 'status' in error && error.status === 413)
    e = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud supera el tamaño permitido.');
  else if (error instanceof SyntaxError && 'status' in error && error.status === 400)
    e = new ApiError(400, 'INVALID_JSON', 'JSON inválido.');
  else if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_BUSY')
  )
    e = new ApiError(
      409,
      'CONCURRENT_UPDATE',
      'Los datos están siendo modificados. Actualiza y vuelve a intentarlo.',
    );
  else if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_CONSTRAINT')
  )
    e = new ApiError(
      409,
      'CONSTRAINT_VIOLATION',
      'La operación entra en conflicto con datos existentes.',
    );
  else {
    logger.error(
      {
        errorType: error instanceof Error ? error.name : 'UnknownError',
        requestId: res.locals.requestId,
      },
      'Error no controlado',
    );
    e = new ApiError(500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado.');
  }
  res.status(e.status).json({
    error: {
      code: e.code,
      message: e.message,
      ...(e.details ? { details: e.details } : {}),
      requestId: res.locals.requestId,
    },
  });
}
export const id = z.string().uuid();
export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
};
export const now = () => new Date().toISOString();
