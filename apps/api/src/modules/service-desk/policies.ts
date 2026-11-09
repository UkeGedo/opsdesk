import { z } from 'zod';
import type { Calendar } from './sla.js';

export type Priority = 'baja' | 'media' | 'alta' | 'urgente';
export type Policy = {
  id: string;
  version: number;
  serviceId: string | null;
  priority: Priority | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  active: boolean;
  firstResponseMs: number;
  resolutionMs: number;
  pauseStatuses: string[];
  calendar: Calendar;
};

/** Service-specific rules win over global rules; within each, exact priority wins. */
export function selectPolicy(
  policies: Policy[],
  serviceId: string | null,
  priority: Priority,
  at: string,
) {
  const observed = Date.parse(at);
  if (!Number.isFinite(observed) || !/(Z|[+-]\d\d:\d\d)$/i.test(at))
    throw new Error('Invalid policy selection time');
  const candidates = policies.filter(
    (p) =>
      p.active &&
      Date.parse(p.effectiveFrom) <= observed &&
      (!p.effectiveUntil || observed < Date.parse(p.effectiveUntil)) &&
      (!p.serviceId || p.serviceId === serviceId) &&
      (!p.priority || p.priority === priority),
  );
  const score = (p: Policy) => (p.serviceId ? 2 : 0) + (p.priority ? 1 : 0);
  candidates.sort((a, b) => score(b) - score(a));
  if (candidates.length > 1 && score(candidates[0]) === score(candidates[1]))
    throw new Error('Ambiguous SLA policy');
  // Clone all nested data: future edits to a policy must not mutate an applied snapshot.
  return candidates[0] ? structuredClone(candidates[0]) : null;
}

export const levels = ['baja', 'media', 'alta', 'urgente'] as const;
export type Matrix = Record<Priority, Record<Priority, Priority>>;
export function priorityFromMatrix(matrix: Matrix, impact: Priority, urgency: Priority) {
  const result = matrix[impact]?.[urgency];
  if (!levels.includes(result)) throw new Error('Incomplete priority matrix');
  return {
    priority: result,
    explanation: `Impacto ${impact} y urgencia ${urgency}: prioridad ${result}.`,
  };
}

const field = z.discriminatedUnion('type', [
  z
    .object({
      key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
      label: z.string().trim().min(1).max(120),
      type: z.literal('text'),
      required: z.boolean(),
      maxLength: z.number().int().min(1).max(5000),
    })
    .strict(),
  z
    .object({
      key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
      label: z.string().trim().min(1).max(120),
      type: z.literal('select'),
      required: z.boolean(),
      options: z
        .array(z.string().trim().min(1).max(120))
        .min(1)
        .max(50)
        .refine((values) => new Set(values).size === values.length),
    })
    .strict(),
  z
    .object({
      key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
      label: z.string().trim().min(1).max(120),
      type: z.literal('boolean'),
      required: z.boolean(),
    })
    .strict(),
]);
export const formDefinition = z
  .object({
    version: z.number().int().positive(),
    fields: z
      .array(field)
      .max(40)
      .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length),
  })
  .strict();

/** Declarative fields only: no code or expression evaluation. */
export function validateForm(definition: unknown, values: unknown) {
  const schema = formDefinition.parse(definition);
  const input = z.record(z.string(), z.unknown()).parse(values);
  const errors: Record<string, string> = {};
  for (const key of Object.keys(input))
    if (!schema.fields.some((f) => f.key === key)) errors[key] = 'Campo desconocido.';
  for (const f of schema.fields) {
    const value = input[f.key];
    if (value === undefined || value === null || value === '') {
      if (f.required) errors[f.key] = 'Este campo es obligatorio.';
    } else if (
      f.type === 'text' &&
      (typeof value !== 'string' || value.length > f.maxLength || !value.trim())
    )
      errors[f.key] = 'Texto no válido.';
    else if (f.type === 'select' && (typeof value !== 'string' || !f.options.includes(value)))
      errors[f.key] = 'Opción no válida.';
    else if (f.type === 'boolean' && typeof value !== 'boolean') errors[f.key] = 'Valor no válido.';
  }
  return { valid: Object.keys(errors).length === 0, errors, version: schema.version };
}
