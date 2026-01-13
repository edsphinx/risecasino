
/**
 * VyreJack Logo Component
 *
 * Full SVG logo with spade symbol and text
 * Variants: full (desktop), compact (mobile), icon (minimal)
 */

interface LogoProps {
  size?: 'full' | 'compact' | 'icon';
  variant?: 'vyrejack' | 'vyrecasino';
  animated?: boolean;
  className?: string;
}

export function Logo({
  size = 'full',
  variant = 'vyrejack',
  animated = true,
  className = '',
}: LogoProps) {
  const animatedClass = animated ? 'logo-animated' : '';

  if (size === 'icon') {
    return (
      <div className={`logo-icon ${animatedClass} ${className}`}>
        <SpadeIcon />
      </div>
    );
  }

  // Full and compact use the complete logo SVG
  const sizeClass = size === 'compact' ? 'logo-compact' : 'logo-full';

  return (
    <div className={`${sizeClass} ${animatedClass} ${className}`}>
      <FullLogo variant={variant} />
    </div>
  );
}

/**
 * Spade Icon - SVG with DEGEN gradient
 * Used for icon-only mode and loaders
 */
function SpadeIcon() {
  const uniqueId = Math.random().toString(36).substring(2, 8);
  const gradientId = `spadeGrad-${uniqueId}`;
  const glowId = `spadeGlow-${uniqueId}`;

  return (
    <svg
      className="logo-spade"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="VyreJack Spade"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M50 5 C50 5 15 40 15 55 C15 70 30 75 42 68 C40 78 35 85 30 90 L70 90 C65 85 60 78 58 68 C70 75 85 70 85 55 C85 40 50 5 50 5 Z"
        fill={`url(#${gradientId})`}
        filter={`url(#${glowId})`}
      />
    </svg>
  );
}

/**
 * Full Logo SVG - Spade + Text in one SVG
 * Uses gradient text, glow effects, and 3D shadow
 */
function FullLogo({ variant }: { variant: 'vyrejack' | 'vyrecasino' }) {
  const uniqueId = Math.random().toString(36).substring(2, 8);
  const gradientId = `logoGrad-${uniqueId}`;
  const textGradientId = `textGrad-${uniqueId}`;
  const glowId = `logoGlow-${uniqueId}`;
  const shadowId = `shadow3d-${uniqueId}`;

  const text = variant === 'vyrecasino' ? 'VYRECASINO' : 'VYREJACK';
  // Adjust viewBox width based on text length - tight bounds
  const viewBoxWidth = variant === 'vyrecasino' ? 275 : 235;

  return (
    <svg
      className="logo-svg-full"
      viewBox={`0 0 ${viewBoxWidth} 50`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={text}
    >
      <defs>
        {/* Spade gradient */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        {/* Text gradient */}
        <linearGradient id={textGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        {/* Glow filter */}
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* 3D shadow filter */}
        <filter id={shadowId} x="-10%" y="-10%" width="130%" height="140%">
          <feDropShadow
            dx="1.5"
            dy="2"
            stdDeviation="0.5"
            floodColor="#000000"
            floodOpacity="0.6"
          />
        </filter>
      </defs>

      {/* Spade icon - closer to text with 3D effect */}
      <g transform="translate(2, 2) scale(0.45)" filter={`url(#${shadowId})`}>
        <path
          d="M50 5 C50 5 15 40 15 55 C15 70 30 75 42 68 C40 78 35 85 30 90 L70 90 C65 85 60 78 58 68 C70 75 85 70 85 55 C85 40 50 5 50 5 Z"
          fill={`url(#${gradientId})`}
          stroke="#1a1a1a"
          strokeWidth="1.5"
        />
      </g>

      {/* Text black outline for 3D depth */}
      <text
        x="48"
        y="36"
        fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
        fontSize="28"
        fontWeight="900"
        letterSpacing="3"
        stroke="#1a1a1a"
        strokeWidth="2"
        fill="none"
        filter={`url(#${shadowId})`}
      >
        {text}
      </text>

      {/* Logo text with gradient */}
      <text
        x="48"
        y="36"
        fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
        fontSize="28"
        fontWeight="900"
        letterSpacing="3"
        fill={`url(#${textGradientId})`}
        filter={`url(#${glowId})`}
      >
        {text}
      </text>
    </svg>
  );
}

/**
 * VyreJack Loader Component
 *
 * CSS-only loading animation
 */
export function VyreJackLoader({ message = 'DEALING...' }: { message?: string }) {
  return (
    <div className="vyrejack-loader">
      <div className="loader-ring">
        <div className="loader-dot" />
      </div>
      <div className="loader-glow" />
      <div className="loader-center">
        <SpadeIcon />
      </div>
      <div className="loader-particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`loader-particle particle-${i}`} />
        ))}
      </div>
      <div className="loader-text">
        <span>{message}</span>
        <div className="loader-dots">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
    </div>
  );
}

// Export SpadeIcon for use elsewhere
export { SpadeIcon };
