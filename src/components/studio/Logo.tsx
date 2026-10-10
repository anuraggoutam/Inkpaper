/** InkPaper mark: a ruled practical page with a line of handwriting (same artwork as src/app/icon.svg). */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="#2f4b9a" />
      <rect x="13" y="9" width="38" height="46" rx="3.5" fill="#fffefa" />
      <path d="M13 19.5h38M13 21.5h38" stroke="#9aa6c4" strokeWidth="1" />
      <path d="M13 30.5h38M13 39.5h38M13 48.5h38" stroke="#c9d9ee" strokeWidth="1.6" />
      <path d="M21.5 9v46" stroke="#e39a9a" strokeWidth="1.6" />
      <path
        d="M25.5 28.5c2.2-4.6 4.1 1.9 6.3-1.3 1.9-2.8 3.4-3.5 4.6.1 1 2.9 2.9 2.1 4.6-.9 1.2-2.1 2.6-2.4 4 .3"
        fill="none"
        stroke="#1b3a8c"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M25.5 37.5c1.6-3.2 3.3.8 5.1-1.2 1.6-1.8 2.9-1.5 4 .8" fill="none" stroke="#1b3a8c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
