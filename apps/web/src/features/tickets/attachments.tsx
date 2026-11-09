import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/security';
import { useDirtyNavigation } from '../workspace/navigation-guard';
type Attachment = { id: string; originalName: string; size: number; createdAt: string };
export function Attachments({ ticketId, archived }: { ticketId: string; archived: boolean }) {
  const { request, session } = useSession();
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  useDirtyNavigation(!!file);
  const [inputKey, setInputKey] = useState(0);
  const list = useQuery({
    queryKey: ['attachments', ticketId],
    queryFn: async () =>
      (await request(`/tickets/${encodeURIComponent(ticketId)}/attachments`)) as {
        data: Attachment[];
      },
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !session) throw new Error('Selecciona un archivo.');
      const response = await fetch(
        `/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments?name=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': session.csrf },
          body: file,
        },
      );
      if (!response.ok) {
        let message = 'No se pudo subir el archivo.';
        try {
          const data = (await response.json()) as { error?: { message?: string } };
          message = data.error?.message ?? message;
        } catch {
          // Se conserva el mensaje genérico para respuestas no JSON.
        }
        throw new Error(message);
      }
      return response.json();
    },
    onSuccess: () => {
      setFile(null);
      setInputKey((k) => k + 1);
      void cache.invalidateQueries({ queryKey: ['attachments', ticketId] });
      void cache.invalidateQueries({ queryKey: ['history', ticketId] });
    },
  });
  return (
    <section>
      <h2>Archivos adjuntos</h2>
      <p>PDF, PNG o JPEG. El servidor comprueba el formato y el tamaño permitido.</p>
      {list.isPending ? (
        <p role="status">Cargando adjuntos…</p>
      ) : list.isError ? (
        <p role="alert">No se pudieron cargar los adjuntos.</p>
      ) : list.data?.data.length ? (
        <ul>
          {list.data.data.map((a) => (
            <li key={a.id}>
              <a
                href={`/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(a.id)}`}
              >
                {a.originalName}
              </a>{' '}
              · {Math.ceil(a.size / 1024)} KB
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No hay archivos adjuntos.</p>
      )}
      {!archived && (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            upload.mutate();
          }}
        >
          <label>
            Seleccionar archivo
            <input
              key={inputKey}
              required
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {upload.isError && (
            <p role="alert">
              {upload.error instanceof Error ? upload.error.message : 'No se pudo subir.'}
            </p>
          )}
          {upload.isSuccess && <p role="status">Archivo adjuntado.</p>}
          <button className="security-button" disabled={upload.isPending || !file}>
            {upload.isPending ? 'Subiendo…' : 'Adjuntar archivo'}
          </button>
        </form>
      )}
    </section>
  );
}
