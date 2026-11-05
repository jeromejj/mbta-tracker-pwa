export const TrainIcon = ({ size = 16, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", flexShrink: 0 }}
    aria-hidden="true"
  >
    <rect x="4" y="3" width="16" height="15" rx="3" />
    <path d="M4 11h16" />
    <path d="M12 3v8" />
    <circle cx="8.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    <path d="M7 18l-2 3" />
    <path d="M17 18l2 3" />
  </svg>
);

export const SparklesIcon = ({ size = 16, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={{ display: "block", flexShrink: 0 }}
    aria-hidden="true"
  >
    <path d="M10 2.5c.3 0 .55.2.63.49l1.19 4.3a4.5 4.5 0 0 0 3.19 3.19l4.3 1.19a.65.65 0 0 1 0 1.26l-4.3 1.19a4.5 4.5 0 0 0-3.19 3.19l-1.19 4.3a.65.65 0 0 1-1.26 0l-1.19-4.3a4.5 4.5 0 0 0-3.19-3.19L1.49 12.9a.65.65 0 0 1 0-1.26l4.3-1.19a4.5 4.5 0 0 0 3.19-3.19l1.19-4.3A.65.65 0 0 1 10 2.5Z" />
    <path d="M19 2a.5.5 0 0 1 .48.36l.53 1.78a2 2 0 0 0 1.35 1.35l1.78.53a.5.5 0 0 1 0 .96l-1.78.53a2 2 0 0 0-1.35 1.35l-.53 1.78a.5.5 0 0 1-.96 0l-.53-1.78a2 2 0 0 0-1.35-1.35l-1.78-.53a.5.5 0 0 1 0-.96l1.78-.53a2 2 0 0 0 1.35-1.35l.53-1.78A.5.5 0 0 1 19 2Z" />
  </svg>
);

export const SearchIcon = ({ size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", flexShrink: 0 }}
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

export const StarIcon = ({ size = 20, filled = false, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", flexShrink: 0 }}
    aria-hidden="true"
  >
    <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
  </svg>
);

export const MapIcon = ({ size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", flexShrink: 0 }}
    aria-hidden="true"
  >
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);

export const AlertIcon = ({ size = 18, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", flexShrink: 0 }}
    aria-hidden="true"
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
