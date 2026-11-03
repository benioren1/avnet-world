import { useCallback, useRef, useState } from 'react';

const LIMIT = 100;

// Undo/redo over whole-architecture snapshots.
// Call snapshot() right before a change; undo()/redo() return the state to restore.
export function useHistory(getCurrent) {
  const past = useRef([]);
  const future = useRef([]);
  const [, bump] = useState(0);

  const snapshot = useCallback(() => {
    past.current.push(structuredClone(getCurrent()));
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    bump((x) => x + 1);
  }, [getCurrent]);

  const undo = useCallback(() => {
    if (!past.current.length) return null;
    future.current.push(structuredClone(getCurrent()));
    bump((x) => x + 1);
    return past.current.pop();
  }, [getCurrent]);

  const redo = useCallback(() => {
    if (!future.current.length) return null;
    past.current.push(structuredClone(getCurrent()));
    bump((x) => x + 1);
    return future.current.pop();
  }, [getCurrent]);

  return {
    snapshot,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
