// SVG radar chart for player tool ratings. Two series max: current
// (blue, --viz-series-1) and potential (yellow, --viz-series-2). Colors
// and chrome come from CSS variables defined in index.css so light/dark
// both render from validated palette steps.

const RINGS = [25, 50, 75, 100];

function polarPoint(cx, cy, r, index, count) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function polygonPoints(cx, cy, r, values, count) {
  return values
    .map((v, i) => polarPoint(cx, cy, (r * v) / 100, i, count).join(','))
    .join(' ');
}

export default function RadarChart({ title, axes, size = 250 }) {
  if (!axes || axes.length < 3) return null;

  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 36;
  const hasPotential = axes.some((a) => a.potential != null);

  const current = axes.map((a) => a.value ?? 0);
  const potential = axes.map((a) => a.potential ?? a.value ?? 0);

  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h4>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block w-full max-w-[280px]"
        role="img"
        aria-label={`${title} radar chart`}
      >
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygonPoints(cx, cy, r, axes.map(() => ring), n)}
            fill="none"
            stroke="var(--viz-grid)"
            strokeWidth="1"
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = polarPoint(cx, cy, r, i, n);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="var(--viz-grid)"
              strokeWidth="1"
            />
          );
        })}

        {hasPotential && (
          <polygon
            points={polygonPoints(cx, cy, r, potential, n)}
            fill="var(--viz-series-2)"
            fillOpacity="0.12"
            stroke="var(--viz-series-2)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        <polygon
          points={polygonPoints(cx, cy, r, current, n)}
          fill="var(--viz-series-1)"
          fillOpacity="0.15"
          stroke="var(--viz-series-1)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {axes.map((a, i) => {
          const [x, y] = polarPoint(cx, cy, (r * (a.value ?? 0)) / 100, i, n);
          return (
            <circle key={i} cx={x} cy={y} r="4" fill="var(--viz-series-1)">
              <title>
                {a.label}: {a.raw}
                {a.rawPot != null ? ` (potential ${a.rawPot})` : ''}
              </title>
            </circle>
          );
        })}

        {axes.map((a, i) => {
          const [x, y] = polarPoint(cx, cy, r + 16, i, n);
          const anchor =
            Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
          return (
            <text
              key={i}
              x={x}
              y={y + 3}
              textAnchor={anchor}
              fontSize="10"
              fill="var(--viz-muted)"
            >
              {a.label}
            </text>
          );
        })}
      </svg>

      {hasPotential && (
        <div className="mt-1 flex justify-center gap-4 text-[11px] text-gray-600 dark:text-gray-300">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: 'var(--viz-series-1)' }}
            />
            Current
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: 'var(--viz-series-2)' }}
            />
            Potential
          </span>
        </div>
      )}

      {/* Values table — keeps exact numbers visible (accessibility relief) */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        {axes.map((a) => (
          <div key={a.label} className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">{a.label}</span>
            <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200">
              {a.raw}
              {a.rawPot != null && (
                <span className="text-gray-400 dark:text-gray-500"> / {a.rawPot}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
