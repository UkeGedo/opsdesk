import { describe, expect, it, vi } from 'vitest';
import { createDomainEventBus } from './domain-events.js';

describe('eventos de dominio en proceso', () => {
  it('entrega señales tipadas y permite cancelar una suscripción', () => {
    const bus = createDomainEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    const event = { type: 'ticket.created', ticketId: 'ticket-1', actorId: 'actor-1' } as const;
    bus.publish(event);
    unsubscribe();
    bus.publish(event);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });
  it('aísla los fallos de un suscriptor sin impedir la entrega a otros', () => {
    const bus = createDomainEventBus();
    const listener = vi.fn();
    bus.subscribe(() => {
      throw new Error('fallo de prueba');
    });
    bus.subscribe(listener);
    expect(() =>
      bus.publish({ type: 'task.completed', taskId: 'task-1', actorId: 'actor-1' }),
    ).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
