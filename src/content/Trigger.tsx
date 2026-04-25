import React from 'react';

/**
 * The Viztara logo mark, inlined as SVG so it renders crisply at any DPI
 * and doesn't require loading external assets inside the shadow DOM.
 *
 * Composition: a rotated rounded square (the "head") with a diagonal trail
 * of progressively smaller squares descending toward the bottom-left.
 * Stylized as motion / insight emerging from a single point.
 *
 * Drawn pre-rotated in the SVG to keep the glyph crisp at small sizes
 * (rotating via CSS transform softens edges on retina displays).
 */
export function LogoMark({ size = 26, color = '#ffffff' }: { size?: number; color?: string }) {
  // viewBox is 100x100 so coordinates map directly to percentages of the icon
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Head — large rotated rounded square at top-right */}
      <g transform="rotate(45 71 29)">
        <rect x="56" y="14" width="30" height="30" rx="6" fill={color} />
      </g>
      {/* Mid trail block */}
      <g transform="rotate(45 50 50)">
        <rect x="42.5" y="42.5" width="15" height="15" rx="3.5" fill={color} />
      </g>
      {/* Smaller block */}
      <g transform="rotate(45 35 65)">
        <rect x="29" y="59" width="12" height="12" rx="3" fill={color} />
      </g>
      {/* Tail terminus */}
      <g transform="rotate(45 22 78)">
        <rect x="17" y="73" width="10" height="10" rx="2.5" fill={color} />
      </g>
    </svg>
  );
}

interface TriggerProps {
  onClick: () => void;
}

export function Trigger({ onClick }: TriggerProps) {
  return (
    <button
      className="tl-trigger"
      onClick={onClick}
      aria-label="Open Viztara"
      title="Explain this viz"
    >
      <LogoMark />
    </button>
  );
}
