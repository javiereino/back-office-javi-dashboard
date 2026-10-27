// Decorative wireframe globe for the sidebar footer (pure SVG, no external assets).
export function Globe({ className }: { className?: string }) {
  const meridians = [0, 30, 60, 90, 120, 150]
  const parallels = [-60, -30, 0, 30, 60]
  return (
    <svg viewBox="-110 -110 220 220" className={className} aria-hidden>
      <defs>
        <radialGradient id="g-fill" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#35BCE8" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#1452b5" stopOpacity="0.18" />
          <stop offset="1" stopColor="#081426" stopOpacity="0" />
        </radialGradient>
        <filter id="g-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle r="96" fill="url(#g-fill)" />
      <g fill="none" stroke="#35BCE8" strokeOpacity="0.55" strokeWidth="0.9" filter="url(#g-glow)">
        <circle r="96" strokeOpacity="0.8" />
        {meridians.map((m) => (
          <ellipse key={m} rx={Math.abs(96 * Math.cos((m * Math.PI) / 180)) || 0.5} ry="96" transform="rotate(-18)" />
        ))}
        {parallels.map((p) => {
          const y = 96 * Math.sin((p * Math.PI) / 180)
          const rx = 96 * Math.cos((p * Math.PI) / 180)
          return <ellipse key={p} cx="0" cy={y} rx={rx} ry={rx * 0.18} transform="rotate(-18)" />
        })}
      </g>
      <g fill="#35BCE8">
        {[
          [-40, -30],
          [10, -52],
          [48, -8],
          [-12, 22],
          [30, 46],
          [-58, 30],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.4" opacity="0.9" />
        ))}
      </g>
      <g stroke="#35BCE8" strokeOpacity="0.35" strokeWidth="0.8">
        <line x1="-40" y1="-30" x2="10" y2="-52" />
        <line x1="10" y1="-52" x2="48" y2="-8" />
        <line x1="-12" y1="22" x2="48" y2="-8" />
        <line x1="-12" y1="22" x2="30" y2="46" />
        <line x1="-58" y1="30" x2="-12" y2="22" />
      </g>
    </svg>
  )
}
