import pino from 'pino';

/** Internal, in-process signals emitted only after a successful database transaction. */
export type DomainEvent =
  | { type: 'ticket.created'; ticketId: string; actorId: string }
  | { type: 'ticket.assigned'; ticketId: string; technicianId: string; actorId: string }
  | { type: 'ticket.resolved'; ticketId: string; actorId: string }
  | { type: 'customer.updated'; customerId: string; actorId: string }
  | { type: 'inventory.movement'; movementId: string; actorId: string }
  | { type: 'task.completed'; taskId: string; actorId: string };

type Handler = (event: DomainEvent) => void | Promise<void>;
const logger = pino();
function reportFailure(event: DomainEvent) {
  logger.error({ eventType: event.type }, 'Falló un suscriptor de eventos');
}
export function createDomainEventBus() {
  const handlers = new Set<Handler>();
  return {
    subscribe(handler: Handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    publish(event: DomainEvent) {
      for (const handler of handlers) {
        try {
          const result = handler(event);
          if (result) void result.catch(() => reportFailure(event));
        } catch {
          reportFailure(event);
        }
      }
    },
  };
}
export type DomainEventBus = ReturnType<typeof createDomainEventBus>;
