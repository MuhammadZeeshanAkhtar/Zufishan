/**
 * Connection status, from the browser's own signal.
 *
 * `navigator.onLine` is honest about one thing only: whether the device has a network interface up.
 * It cannot tell you the server is reachable, so it is used here to *explain* a failure that already
 * happened, never to pre-emptively block a request. A request is always attempted; if it fails while
 * the browser reports offline, the surface says so instead of blaming the server.
 */
import { useEffect, useState } from "react";

const read = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(read);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // The events can be missed while the tab is hidden, so re-read on return.
    const onVisible = () => setOnline(read());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return online;
}
