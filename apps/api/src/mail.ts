import nodemailer from 'nodemailer';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { config } from './config.js';
export async function sendRecovery(email: string, link: string) {
  if (config.MAIL_MODE === 'file') {
    await mkdir(config.MAIL_DIR, { recursive: true, mode: 0o700 });
    await writeFile(
      join(config.MAIL_DIR, `${randomUUID()}.eml`),
      `To: ${email}\nSubject: Recuperación de acceso a OpsDesk\n\nPara restablecer tu contraseña visita: ${link}\nEl enlace vence en 30 minutos.\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    return;
  }
  if (config.MAIL_MODE !== 'smtp' || !config.SMTP_HOST || !config.SMTP_FROM)
    throw new Error('Correo no configurado');
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: !config.SMTP_SECURE,
    ...(config.SMTP_CA_FILE ? { tls: { ca: await readFile(config.SMTP_CA_FILE) } } : {}),
    ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } } : {}),
  });
  await transport.sendMail({
    from: config.SMTP_FROM,
    to: email,
    subject: 'Recuperación de acceso a OpsDesk',
    text: `Para restablecer tu contraseña visita: ${link}\nEl enlace vence en 30 minutos. Si no solicitaste este cambio, ignora este mensaje.`,
  });
}
