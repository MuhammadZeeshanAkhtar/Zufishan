import { useEffect, useState } from "react";

/**
 * Delays a value until it stops changing.
 *
 * Search boxes on the admin desk are bound to server queries. Without this, every
 * keystroke is a round trip and a page of results the reader never sees — and on
 * a slow connection the answers arrive out of order.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
