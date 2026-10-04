/**
 * Wraps a value in single quotes for a POSIX shell.
 *
 * Inside single quotes everything is literal except a single quote itself, so
 * each one has to close the quoting, add an escaped quote, and reopen it. A
 * commit message or a directory named `it's` would otherwise end the quoting
 * early and hand the rest of the text to the shell as syntax.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
