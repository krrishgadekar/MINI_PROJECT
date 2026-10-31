/**
 * CreditFlow Logo — Reusable brand mark component.
 * Renders the graph-node triangle logo at any size.
 */
export default function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-label="CreditFlow logo"
    >
      <circle cx="16" cy="16" r="15" fill="#0D2247" />
      <path
        d="M10 20 L16 10 L22 20"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M10 20 L22 20" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="10" r="2" fill="#C8502A" />
      <circle cx="10" cy="20" r="2" fill="#1E6B4B" />
      <circle cx="22" cy="20" r="2" fill="#1E6B4B" />
      <circle cx="16" cy="16.5" r="1.5" fill="#ffffff" opacity="0.6" />
    </svg>
  );
}

