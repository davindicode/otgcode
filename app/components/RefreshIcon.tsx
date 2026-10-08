/**
 * The reload glyph, in one place.
 *
 * The explorer, every file viewer and the terminal composer all offer the same
 * action, and the path was pasted into each — seven copies of twenty bytes of
 * bezier that have to agree for them to look like one app.
 */
export default function RefreshIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}
