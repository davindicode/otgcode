import { type ReactNode, useEffect, useState } from "react";

/**
 * Renders its children only in the browser.
 *
 * `fallback` is what the server sends and what the first client render shows,
 * so it is also the whole page if the scripts never arrive — worth making
 * something a person can read rather than an empty document.
 */
export default function ClientOnly({ children, fallback }: { children: () => ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children() : fallback;
}
