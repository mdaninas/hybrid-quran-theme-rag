function IconBase({ children, size = 20, className = "", ...props }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {children}
    </svg>
  );
}

const strokeProps = {
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.8,
};

export function BookOpenIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
      <path {...strokeProps} d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
      <path {...strokeProps} d="M7 7h2M15 7h2" />
    </IconBase>
  );
}

export function ArrowRightIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M5 12h14M13 6l6 6-6 6" />
    </IconBase>
  );
}

export function MailIcon(props) {
  return (
    <IconBase {...props}>
      <rect {...strokeProps} x="3" y="5" width="18" height="14" rx="2.5" />
      <path {...strokeProps} d="m4 7 8 6 8-6" />
    </IconBase>
  );
}

export function LockIcon(props) {
  return (
    <IconBase {...props}>
      <rect {...strokeProps} x="4" y="10" width="16" height="11" rx="2.5" />
      <path {...strokeProps} d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </IconBase>
  );
}

export function EyeIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle {...strokeProps} cx="12" cy="12" r="2.5" />
    </IconBase>
  );
}

export function EyeOffIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="m3 3 18 18M10.6 6.2A9 9 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.1 6.1A15.6 15.6 0 0 0 2.5 12s3.4 6 9.5 6a9 9 0 0 0 3-.5M9.7 9.7a3.2 3.2 0 0 0 4.6 4.6" />
    </IconBase>
  );
}

export function MessageIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z" />
      <path {...strokeProps} d="M7.5 9.5h9M7.5 13h6" />
    </IconBase>
  );
}

export function NetworkIcon(props) {
  return (
    <IconBase {...props}>
      <circle {...strokeProps} cx="12" cy="5" r="2.5" />
      <circle {...strokeProps} cx="5" cy="18" r="2.5" />
      <circle {...strokeProps} cx="19" cy="18" r="2.5" />
      <path {...strokeProps} d="m10.8 7.2-4.6 8.6M13.2 7.2l4.6 8.6M7.5 18h9" />
    </IconBase>
  );
}

export function LogOutIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M18 12H8" />
    </IconBase>
  );
}

export function SendIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="m21 3-7.2 18-3.2-7.6L3 10.2 21 3Z" />
      <path {...strokeProps} d="m10.6 13.4 4.1-4.1" />
    </IconBase>
  );
}

export function WifiIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
      <circle fill="currentColor" cx="12" cy="19.5" r="1.2" />
    </IconBase>
  );
}

export function WifiOffIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="m3 3 18 18M5 12.5a10 10 0 0 1 5-2.7M14 10a10 10 0 0 1 5 2.5M8.5 16a5 5 0 0 1 5-1.2" />
      <circle fill="currentColor" cx="12" cy="19.5" r="1.2" />
    </IconBase>
  );
}

export function RefreshIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M20 7v5h-5M4 17v-5h5" />
      <path {...strokeProps} d="M6.1 8.5A7 7 0 0 1 18.7 10M17.9 15.5A7 7 0 0 1 5.3 14" />
    </IconBase>
  );
}

export function MaximizeIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </IconBase>
  );
}

export function ChevronRightIcon(props) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="m9 18 6-6-6-6" />
    </IconBase>
  );
}

export function AtlasPreviewSvg({ size = 200, className = "" }) {
  const height = Math.round(size * 0.5);
  return (
    <svg
      aria-hidden="true"
      className={className ? `atlas-svg ${className}` : "atlas-svg"}
      height={height}
      viewBox="0 0 200 100"
      width={size}
    >
      <line className="graph-edge" stroke="currentColor" strokeWidth="2" x1="48" x2="88" y1="50" y2="50" />
      <line className="graph-edge" stroke="currentColor" strokeWidth="2" x1="112" x2="152" y1="50" y2="50" />
      <rect
        className="graph-node-theme"
        fill="var(--atlas-theme-fill, var(--slate))"
        height="36"
        rx="6"
        stroke="var(--atlas-theme-stroke, var(--slate))"
        strokeWidth="1.5"
        width="40"
        x="8"
        y="32"
      />
      <text
        fill="var(--atlas-theme-text, #ffffff)"
        fontFamily='"IBM Plex Sans", "Segoe UI", sans-serif'
        fontSize="14"
        fontWeight="600"
        textAnchor="middle"
        x="28"
        y="54"
      >
        T
      </text>
      <circle
        className="graph-node-verse"
        cx="100"
        cy="50"
        fill="var(--terracotta)"
        r="20"
        stroke="var(--terracotta)"
        strokeWidth="1.5"
      />
      <text
        fill="#ffffff"
        fontFamily='"IBM Plex Sans", "Segoe UI", sans-serif'
        fontSize="13"
        fontWeight="600"
        textAnchor="middle"
        x="100"
        y="55"
      >
        A
      </text>
      <rect
        className="graph-node-surah"
        fill="#2f6f86"
        height="36"
        rx="6"
        stroke="#214f61"
        strokeWidth="1.5"
        width="40"
        x="152"
        y="32"
      />
      <text
        fill="#ffffff"
        fontFamily='"IBM Plex Sans", "Segoe UI", sans-serif'
        fontSize="14"
        fontWeight="600"
        textAnchor="middle"
        x="172"
        y="54"
      >
        S
      </text>
    </svg>
  );
}
