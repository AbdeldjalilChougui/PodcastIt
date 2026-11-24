/** Inline SVG icons (stroke = currentColor). */
import type { JSX } from "preact";

type P = { size?: number; class?: string; title?: string };

function Svg({ size = 20, class: cls, title, children }: P & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      class={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : <></>}
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4.5h4.5" />
    <text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">
      15
    </text>
  </Svg>
);
export const IconFwd = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v4.5h-4.5" />
    <text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">
      15
    </text>
  </Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Svg>
);
export const IconFile = (p: P) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);
export const IconText = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M4 11h16M4 16h10" />
  </Svg>
);
export const IconLibrary = (p: P) => (
  <Svg {...p}>
    <path d="M5 4v16M10 4v16M15 5l4 14.5" />
  </Svg>
);
export const IconSpark = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const IconRetry = (p: P) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Svg>
);
export const IconBackArrow = (p: P) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Svg>
);
export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
);

/** Brand mark: a speech bubble with sound bars. */
export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="pi-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FF6A3D" />
        <stop offset="1" stop-color="#7B5CFF" />
      </linearGradient>
    </defs>
    <path d="M14 6h36a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H30l-12 10v-10h-4A10 10 0 0 1 4 38V16A10 10 0 0 1 14 6z" fill="url(#pi-g)" />
    <g fill="#fff">
      <rect x="16" y="22" width="5" height="12" rx="2.5" />
      <rect x="25" y="15" width="5" height="26" rx="2.5" />
      <rect x="34" y="19" width="5" height="18" rx="2.5" />
      <rect x="43" y="24" width="5" height="8" rx="2.5" />
    </g>
  </svg>
);
