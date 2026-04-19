export const DEFAULT_FONT_SIZE = 6;
export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 24;

function getAppPort(): number {
  if (typeof document === "undefined") return 0;
  // Read from meta tag injected by server
  const meta = document.querySelector('meta[name="otg-port"]');
  if (meta) return parseInt(meta.getAttribute("content") || "", 10) || 0;
  // Fallback to window.location.port
  return parseInt(window.location.port, 10) || 0;
}

export function isPortBlocked(port: number): string | null {
  if (isNaN(port) || port < 1 || port > 65535) {
    return "Invalid port number";
  }
  // Privileged ports (except 80, 443)
  if (port >= 1 && port <= 1023 && port !== 80 && port !== 443) {
    return `Port ${port} is blocked (privileged)`;
  }
  // The app's own port
  const appPort = getAppPort();
  if (appPort && port === appPort) {
    return `Port ${port} is used by OTG Code`;
  }
  return null;
}
