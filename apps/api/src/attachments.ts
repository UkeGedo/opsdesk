import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { extname, resolve, join } from 'node:path';
import { Router, raw } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db.js';
import { ApiError, id, notFound, now } from './common.js';
import { auditLogs, events, ticketAttachments } from './schema.js';
import { requirePermission, visibleTicket } from './policies.js';
import { config } from './config.js';
function signature(bytes: Buffer, extension: string) {
  if (extension === '.pdf' && bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    return 'application/pdf';
  if (
    extension === '.png' &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    (extension === '.jpg' || extension === '.jpeg') &&
    bytes.length >= 4 &&
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
    bytes.subarray(-2).equals(Buffer.from([255, 217]))
  )
    return 'image/jpeg';
  return null;
}
export function attachmentRoutes(db: Db, directory = config.ATTACHMENT_DIR) {
  const router = Router({ mergeParams: true });
  const root = resolve(directory);
  router.get('/', requirePermission('tickets.read'), (req, res) => {
    const ticketId = id.parse(req.params.id);
    visibleTicket(db, res.locals.user, ticketId);
    res.json({
      data: db
        .select()
        .from(ticketAttachments)
        .where(eq(ticketAttachments.ticketId, ticketId))
        .orderBy(asc(ticketAttachments.createdAt))
        .all(),
    });
  });
  router.post(
    '/',
    requirePermission('tickets.comment'),
    raw({ type: 'application/octet-stream', limit: config.ATTACHMENT_MAX_BYTES }),
    (req, res) => {
      const ticketId = id.parse(req.params.id);
      const ticket = visibleTicket(db, res.locals.user, ticketId);
      if (ticket.archivedAt) throw new ApiError(409, 'ARCHIVED', 'El ticket está archivado.');
      const name = z.string().trim().min(1).max(180).parse(req.query.name);
      if (
        name.includes('/') ||
        name.includes('\\') ||
        Array.from(name).some((c) => c.charCodeAt(0) < 32)
      )
        throw new ApiError(400, 'INVALID_FILENAME', 'Nombre de archivo no permitido.');
      const bytes: unknown = req.body;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0)
        throw new ApiError(
          400,
          'INVALID_FILE',
          'El archivo está vacío o tiene un formato incorrecto.',
        );
      const mime = signature(bytes, extname(name).toLowerCase());
      if (!mime)
        throw new ApiError(
          400,
          'INVALID_FILE',
          'Solo se admiten archivos PDF, PNG y JPEG válidos.',
        );
      const fileId = randomUUID(),
        path = join(root, fileId),
        date = now();
      mkdirSync(root, { recursive: true, mode: 0o700 });
      writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
      try {
        const item = db.transaction((tx) => {
          const item = tx
            .insert(ticketAttachments)
            .values({
              id: fileId,
              ticketId,
              authorId: res.locals.user.id,
              originalName: name,
              mimeType: mime,
              size: bytes.length,
              createdAt: date,
            })
            .returning()
            .get();
          tx.insert(events)
            .values({
              id: randomUUID(),
              ticketId,
              actorId: res.locals.user.id,
              type: 'adjunto_agregado',
              detail: JSON.stringify({ attachmentId: fileId, name }),
              createdAt: date,
            })
            .run();
          tx.insert(auditLogs)
            .values({
              id: randomUUID(),
              actorId: res.locals.user.id,
              action: 'attachment.created',
              resourceType: 'attachment',
              resourceId: fileId,
              createdAt: date,
            })
            .run();
          return item;
        });
        res.status(201).json({ data: item });
      } catch (error) {
        try {
          unlinkSync(path);
        } catch {
          // El archivo huérfano se puede retirar mediante mantenimiento.
        }
        throw error;
      }
    },
  );
  router.get('/:attachmentId', requirePermission('tickets.read'), (req, res) => {
    const ticketId = id.parse(req.params.id),
      attachmentId = id.parse(req.params.attachmentId);
    visibleTicket(db, res.locals.user, ticketId);
    const item = db
      .select()
      .from(ticketAttachments)
      .where(and(eq(ticketAttachments.id, attachmentId), eq(ticketAttachments.ticketId, ticketId)))
      .get();
    if (!item) throw notFound();
    const path = join(root, item.id);
    if (!existsSync(path))
      throw new ApiError(404, 'FILE_UNAVAILABLE', 'El archivo no está disponible.');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(item.originalName)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path);
  });
  return router;
}
