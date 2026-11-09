import { describe, expect, it } from 'vitest';
import {
  selectPolicy,
  priorityFromMatrix,
  validateForm,
  type Matrix,
  type Policy,
} from './policies.js';

const base: Policy = {
  id: 'p1',
  version: 1,
  serviceId: null,
  priority: null,
  effectiveFrom: '2026-01-01T00:00:00Z',
  effectiveUntil: null,
  active: true,
  firstResponseMs: 3600000,
  resolutionMs: 7200000,
  pauseStatuses: ['pendiente_cliente'],
  calendar: {
    timeZone: 'America/Bogota',
    weekly: { 1: [{ start: 540, end: 1020 }] },
    exceptions: {},
  },
};
describe('service desk policy rules', () => {
  it('resolves precedence, rejects ambiguous rules and freezes snapshots', () => {
    const service = { ...base, id: 'p2', serviceId: 's1' };
    const priority = { ...base, id: 'p3', priority: 'alta' as const };
    const chosen = selectPolicy([base, priority, service], 's1', 'alta', '2026-03-01T00:00:00Z')!;
    expect(chosen.id).toBe('p2');
    service.calendar.weekly[1]![0].start = 600;
    expect(chosen.calendar.weekly[1]![0].start).toBe(540);
    expect(() =>
      selectPolicy([service, { ...service, id: 'p4' }], 's1', 'alta', '2026-03-01T00:00:00Z'),
    ).toThrow('Ambiguous');
    expect(
      selectPolicy(
        [{ ...base, effectiveUntil: '2026-03-01T00:00:00Z' }],
        null,
        'alta',
        '2026-03-01T00:00:00Z',
      ),
    ).toBeNull();
  });
  it('uses the configured impact and urgency matrix and explains the result', () => {
    const matrix = { alta: { baja: 'media' } } as Matrix;
    expect(priorityFromMatrix(matrix, 'alta', 'baja')).toEqual({
      priority: 'media',
      explanation: 'Impacto alta y urgencia baja: prioridad media.',
    });
    expect(() => priorityFromMatrix(matrix, 'media', 'baja')).toThrow();
  });
  it('validates declarative fields and rejects unknown fields or executable configuration', () => {
    const definition = {
      version: 2,
      fields: [
        { key: 'device', label: 'Equipo', type: 'text', required: true, maxLength: 10 },
        {
          key: 'reason',
          label: 'Motivo',
          type: 'select',
          required: true,
          options: ['Daño', 'Cambio'],
        },
        { key: 'remote', label: 'Remoto', type: 'boolean', required: true },
      ],
    };
    expect(validateForm(definition, { device: 'PC', reason: 'Daño', remote: false })).toMatchObject(
      { valid: true, version: 2 },
    );
    expect(validateForm(definition, { device: '', reason: 'otro', extra: 'x' }).errors).toEqual({
      extra: 'Campo desconocido.',
      device: 'Este campo es obligatorio.',
      reason: 'Opción no válida.',
      remote: 'Este campo es obligatorio.',
    });
    expect(() => validateForm({ ...definition, script: 'alert(1)' }, {})).toThrow();
  });
});
