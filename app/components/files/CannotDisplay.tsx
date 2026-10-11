import DownloadIcon from "~/components/DownloadIcon";
import { formatSize } from "~/lib/format";

/**
 * The one dead end in the explorer: a file this app cannot render.
 *
 * Every viewer that can fail lands here, because "we cannot show this" is
 * useless on its own — each of these cases used to end differently, as a
 * broken-image icon, a red line of text, or an error with a Retry that could
 * never work. What they all have in common is that the file itself is still
 * perfectly readable by something on the user's device, so the download is
 * part of the message rather than a button to go hunting for.
 */
export default function CannotDisplay({
  path,
  title,
  detail,
  size,
  children,
}: {
  path: string;
  /** What cannot be done, in one line. */
  title: string;
  /** Why, and what to do instead. */
  detail: string;
  size?: number;
  /** Extra choices this particular case can offer. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-app px-6 py-8">
      <svg className="h-8 w-8 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <span className="text-center text-sm text-ink">{title}</span>
      <span className="max-w-full truncate text-center text-xs text-ink-ghost">
        {path}
        {size !== undefined && ` · ${formatSize(size)}`}
      </span>
      <p className="max-w-xs text-center text-[11px] leading-relaxed text-ink-faint">{detail}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <a
          href={`/api/files/download?path=${encodeURIComponent(path)}`}
          download
          className="relief-accent flex items-center gap-2 rounded-control px-4 py-2 text-sm text-white"
        >
          <DownloadIcon />
          Download
        </a>
        {children}
      </div>
    </div>
  );
}
