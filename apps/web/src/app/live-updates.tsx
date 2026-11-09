import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
export function LiveUpdates({ userId }: { userId: string }) {
  const cache = useQueryClient();
  useEffect(() => {
    const socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket'] });
    const refresh = () => {
      void cache.invalidateQueries();
    };
    socket.on('connect', refresh);
    socket.on('changed', refresh);
    return () => {
      socket.off('connect', refresh);
      socket.off('changed', refresh);
      socket.disconnect();
    };
  }, [cache, userId]);
  return null;
}
