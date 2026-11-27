import type { ReactNode } from 'react';

const S = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icons = {
  upload: <S><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></S>,
  plus: <S><path d="M12 5v14M5 12h14" /></S>,
  folder: <S><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>,
  home: <S><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></S>,
  back: <S><path d="M9 6l6 6-6 6" /></S>,
  undo: <S><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></S>,
  redo: <S><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></S>,
  print: <S><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></S>,
  download: <S><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></S>,
  copy: <S><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></S>,
  trash: <S><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></S>,
  edit: <S><path d="M4 20h4L19 9l-4-4L4 16z" /></S>,
  zoomIn: <S><circle cx="11" cy="11" r="7" /><path d="M11 8v6M8 11h6M20 20l-4-4" /></S>,
  zoomOut: <S><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-4-4" /></S>,
  fit: <S><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></S>,
  cube: <S><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></S>,
  axes: <S><path d="M12 13V3M12 13l-8 5M12 13l8 5" /><circle cx="12" cy="13" r="1.5" fill="currentColor" /></S>,
  pencil: <S><path d="M3 21l3-1 12-12-2-2L4 18z" /><path d="M14 6l2 2" /></S>,
  image: <S><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></S>,
  select: <S><path d="M5 3l14 8-6 2-2 6z" /></S>,
  point: <S><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></S>,
  line: <S><path d="M5 19L19 5" /><circle cx="5" cy="19" r="1.5" /><circle cx="19" cy="5" r="1.5" /></S>,
  rect: <S><rect x="4" y="6" width="16" height="12" rx="1" /></S>,
  circle: <S><circle cx="12" cy="12" r="8" /></S>,
  triangle: <S><path d="M12 4l9 16H3z" /></S>,
  polygon: <S><path d="M12 3l8 6-3 11H7L4 9z" /></S>,
  text: <S><path d="M5 6V4h14v2M12 4v16M9 20h6" /></S>,
  dim: <S><path d="M4 8v8M20 8v8M4 12h16" /><path d="M7 10l-3 2 3 2M17 10l3 2-3 2" /></S>,
  ruler: <S><path d="M3 16L16 3l5 5L8 21z" /><path d="M7 12l2 2M10 9l2 2M13 6l2 2" /></S>,
  calibrate: <S><path d="M4 18L18 4" /><circle cx="4" cy="18" r="2" /><circle cx="18" cy="4" r="2" /><path d="M9 21h6" /></S>,
  rotate: <S><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></S>,
  crop: <S><path d="M6 2v16h16" /><path d="M2 6h16v16" /></S>,
  grid: <S><path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16" /></S>,
  magnet: <S><path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z" /></S>,
  close: <S><path d="M6 6l12 12M18 6L6 18" /></S>,
  info: <S><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></S>,
  warn: <S><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17h.01" /></S>,
  check: <S><path d="M5 12l5 5 9-10" /></S>,
  hand: <S><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-2L8 14" /></S>,
  section: <S><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M3 14l18-5" strokeDasharray="2 2" /></S>,
  eyeOff: <S><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-3 3.4M6.4 7.4C4.3 8.9 3 12 3 12s4 6 9 6c1.6 0 3-.4 4.3-1" /></S>,
  lock: <S><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></S>,
  unlock: <S><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></S>,
  tree: <S><circle cx="12" cy="9" r="6" /><path d="M12 15v6" /></S>,
  layers: <S><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></S>,
  mountain: <S><path d="M3 19l6-10 4 6 3-4 5 8z" /></S>,
  sheet: <S><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M14 5v14M14 12h7" /></S>,
  view3d: <S><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></S>,
  walk: <S><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6-3-3 1-4 4 3h3M9 12l-2 3" /></S>,
  camera: <S><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l2-3h4l2 3" /></S>,
  keyboard: <S><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></S>,
  eye: <S><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></S>,
  settings: <S><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>,
};

export const Logo = () => (
  <svg className="brand-logo" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#1f4fa8" />
    <path d="M14 46 L32 14 L50 46 Z" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
    <path d="M10 36 L54 28" stroke="#ffb547" strokeWidth="4" strokeLinecap="round" />
  </svg>
);
