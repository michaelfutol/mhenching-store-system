"use client";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Branded SVG logo for the Mhenching Store System.
 * A stylized storefront/receipt icon with the brand color palette.
 */
export default function Logo({ size = 40, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Mhenching Store System"
    >
      {/* Storefront / shopping bag body */}
      <rect x="12" y="22" width="40" height="34" rx="4" fill="#0058be" />

      {/* Bag handle */}
      <path
        d="M22 22V16C22 10.477 26.477 6 32 6C37.523 6 42 10.477 42 16V22"
        stroke="#006e2f"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Barcode lines on the bag */}
      <rect x="20" y="34" width="3" height="14" rx="1" fill="white" opacity="0.9" />
      <rect x="25" y="34" width="2" height="14" rx="1" fill="white" opacity="0.7" />
      <rect x="29" y="34" width="4" height="14" rx="1" fill="white" opacity="0.9" />
      <rect x="35" y="34" width="2" height="14" rx="1" fill="white" opacity="0.7" />
      <rect x="39" y="34" width="3" height="14" rx="1" fill="white" opacity="0.9" />
      <rect x="44" y="34" width="2" height="14" rx="1" fill="white" opacity="0.7" />

      {/* Green accent dot — POS / scan indicator */}
      <circle cx="32" cy="27" r="3" fill="#006e2f" />
    </svg>
  );
}
