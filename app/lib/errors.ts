/**
 * Message for something thrown. `catch` gives you `unknown` — anything can be
 * thrown in JS — so narrow it in one place rather than asserting `any` at
 * every call site and hoping `.message` exists.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
