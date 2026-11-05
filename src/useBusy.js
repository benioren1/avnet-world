import { useCallback, useRef, useState } from 'react';

// Runs one action at a time: a second click while the first request is still on its way
// is ignored (a double click on "give bonus" must not pay twice). `busy` is for disabling
// the button. The ref is checked synchronously, so even two clicks in the same frame are caught.
export function useBusy() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const guard = useCallback(async (fn) => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, guard];
}
