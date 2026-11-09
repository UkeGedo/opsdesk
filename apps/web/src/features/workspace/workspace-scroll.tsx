import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspaceMemory } from './workspace-memory';

/** Restore scroll per visited route without persisting page content. */
export function WorkspaceScroll() {
  const location = useLocation();
  const positions = useRef(new Map<string, number>());
  const memory = useWorkspaceMemory();
  const active = useRef('');
  useEffect(() => {
    function save() {
      positions.current.set(active.current, window.scrollY);
      memory?.set(`scroll:${active.current}`, window.scrollY);
    }
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [memory]);
  useLayoutEffect(() => {
    if (active.current === location.pathname) return;
    active.current = location.pathname;
    if (location.hash) return;
    const saved = memory?.get(`scroll:${location.pathname}`);
    const target =
      positions.current.get(location.pathname) ?? (typeof saved === 'number' ? saved : 0);
    window.scrollTo(0, target);
    const retry = window.setTimeout(() => {
      if (window.scrollY < target) window.scrollTo(0, target);
    }, 250);
    const cancel = () => window.clearTimeout(retry);
    window.addEventListener('wheel', cancel, { once: true, passive: true });
    window.addEventListener('touchstart', cancel, { once: true, passive: true });
    window.addEventListener('keydown', cancel, { once: true });
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('keydown', cancel);
    };
  }, [location.pathname, location.hash, memory]);
  return null;
}
