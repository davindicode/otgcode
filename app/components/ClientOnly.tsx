import { useState, useEffect, type ReactNode } from "react";

export default function ClientOnly({ children }: { children: () => ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children()}</> : null;
}
