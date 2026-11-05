import { useSyncExternalStore } from 'react';

// One shared prefers-reduced-motion listener for every node and edge on the map.
const query = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

const subscribe = (cb) => {
  if (!query) return () => {};
  query.addEventListener('change', cb);
  return () => query.removeEventListener('change', cb);
};

export const prefersReducedMotion = () => Boolean(query?.matches);

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
