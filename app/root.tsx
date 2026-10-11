import { lazy, Suspense } from "react";
import { isRouteErrorResponse, Links, Meta, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import ClientOnly from "./components/ClientOnly";

const AppShell = lazy(() => import("./components/AppShell"));

// The theme is resolved on the server and rendered into <html>, so the first
// paint is already correct — no flash of the wrong theme, and no dependence on
// browser storage.
export async function loader() {
  const { loadWorkspace } = await import("~/lib/workspace.server");
  return { theme: loadWorkspace().theme };
}

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  // Layout also renders for error responses, where the loader may not have run.
  const theme = useRouteLoaderData<typeof loader>("root")?.theme ?? "dark";
  return (
    <html lang="en" className={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        {/* Matches the painted background so the status bar and overscroll
            blend in when installed to a home screen. */}
        <meta name="theme-color" content={theme === "light" ? "#f4f5fa" : "#0d0d1a"} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="OTG Code" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="otg-port" content={String(process.env.OTG_PORT || "7777")} />
        <Meta />
        <Links />
      </head>
      <body className="bg-app text-ink overflow-hidden">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The loading screen, rendered by the server and by the first client render.
 *
 * Styled inline as well as by class: it is what a device sees before anything
 * has executed, and on a tunnel that can be a while — or, if the scripts fail
 * to arrive at all, forever. A blank white page says nothing about why.
 */
function Booting() {
  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-4 bg-app"
      style={{ backgroundColor: "var(--color-app, #0d0d1a)" }}
    >
      <div className="spinner" />
      <span className="text-sm text-ink-faint">Loading OTG Code…</span>
      <noscript>
        <span className="text-sm text-ink-faint">This needs JavaScript. If it is on, the scripts did not load.</span>
      </noscript>
    </div>
  );
}

export default function App() {
  return (
    <ClientOnly fallback={<Booting />}>
      {() => (
        <Suspense fallback={<Booting />}>
          <AppShell />
        </Suspense>
      )}
    </ClientOnly>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-red-400 mb-4">{message}</h1>
        <p className="text-ink-dim mb-4">{details}</p>
        {stack && (
          <pre className="text-left text-xs text-ink-faint overflow-x-auto max-w-xl mx-auto p-4 bg-raised rounded-control">
            {stack}
          </pre>
        )}
      </div>
    </main>
  );
}
