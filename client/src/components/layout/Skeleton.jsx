export function SkeletonBlock({ width = '100%', height = 16, radius = 8, style = {} }) {
  return (
    <span
      className="fr-skeleton"
      aria-hidden="true"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  )
}

export function SkeletonText({ lines = 2, widths = ['100%', '68%'], lineHeight = 14 }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={index}
          width={widths[index] || widths[widths.length - 1] || '100%'}
          height={lineHeight}
          radius={999}
        />
      ))}
    </div>
  )
}

export function SkeletonMetricGrid({ count = 3, minWidth = 130 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 12 }}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="fr-cut-card" style={{ border: '1px solid #252A33', background: '#171B21', padding: 16 }}>
          <SkeletonBlock width="48%" height={11} radius={999} />
          <SkeletonBlock width="34%" height={34} radius={8} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCardGrid({ count = 3, minWidth = 240 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 14 }}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="fr-cut-card" style={{ border: '1px solid #252A33', background: '#171B21', padding: 16 }}>
          <SkeletonBlock height={120} radius={12} />
          <SkeletonBlock width="72%" height={18} radius={999} style={{ marginTop: 14 }} />
          <SkeletonText lines={2} widths={['92%', '54%']} lineHeight={12} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ count = 4 }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} style={{ borderRadius: 12, border: '1px solid #252A33', background: '#171B21', padding: 14, display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 68px', gap: 12, alignItems: 'center' }}>
          <SkeletonBlock width={48} height={48} radius={12} />
          <SkeletonText lines={2} widths={['76%', '44%']} lineHeight={12} />
          <SkeletonBlock height={24} radius={999} />
        </div>
      ))}
    </div>
  )
}
