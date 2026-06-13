import { lazy, Suspense } from "react";
import { isRouteErrorResponse, Links, Meta, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import ClientOnly from "./components/ClientOnly";

const AppShell = lazy(() => import("./components/AppShell"));

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
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
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0d0d1a" />
        <meta name="otg-port" content={String(process.env.OTG_PORT || "7777")} />
        <Meta />
        <Links />
      </head>
      <body className="bg-[#0d0d1a] text-white overflow-hidden">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ClientOnly>
      {() => (
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-screen bg-[#0d0d1a] gap-4">
              <div className="spinner" />
              <span className="text-sm text-gray-500">Loading...</span>
            </div>
          }
        >
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
        <p className="text-gray-400 mb-4">{details}</p>
        {stack && (
          <pre className="text-left text-xs text-gray-500 overflow-x-auto max-w-xl mx-auto p-4 bg-gray-900 rounded">
            {stack}
          </pre>
        )}
      </div>
    </main>
  );
}
