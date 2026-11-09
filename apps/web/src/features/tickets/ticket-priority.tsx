import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../app/security';
export function TicketPriority({ ticketId }: { ticketId: string }) {
  const { request } = useSession();
  const query = useQuery({
    queryKey: ['ticket-priority', ticketId],
    queryFn: async () =>
      (await request(`/tickets/${encodeURIComponent(ticketId)}/priority`)) as {
        data: { explanation: string; matrixVersion: number } | null;
      },
  });
  if (query.isError) return <p role="alert">No se pudo cargar el cálculo de prioridad.</p>;
  if (!query.data?.data) return null;
  return (
    <p>
      {query.data.data.explanation} Matriz versión {query.data.data.matrixVersion}.
    </p>
  );
}
