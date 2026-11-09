import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useSession } from '../../app/security';

const MemoryContext = createContext<Map<string, unknown> | null>(null);

/** Ephemeral view state only: never persisted or shared across signed-in workspaces. */
export function WorkspaceMemory({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const memory = useMemo(() => new Map<string, unknown>(), [session?.user.id]);
  return <MemoryContext.Provider value={memory}>{children}</MemoryContext.Provider>;
}
export function useWorkspaceMemory() {
  return useContext(MemoryContext);
}

export function useViewState<T>(
  key: string,
  initial: T | (() => T),
  preferInitial = false,
): [T, Dispatch<SetStateAction<T>>] {
  const memory = useContext(MemoryContext);
  const [value, setValue] = useState<T>(() =>
    !preferInitial && memory?.has(key)
      ? (memory.get(key) as T)
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial,
  );
  useEffect(() => {
    memory?.set(key, value);
  }, [key, memory, value]);
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current) : next;
        memory?.set(key, resolved);
        return resolved;
      });
    },
    [key, memory],
  );
  return [value, set];
}
