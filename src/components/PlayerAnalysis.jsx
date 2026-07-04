import RadarChart from './RadarChart';
import {
  BATTING_TOOLS,
  PITCHING_TOOLS,
  DEFENSE_TOOLS,
  buildToolAxes,
  compositeScore,
  pickPlayerStats,
  BAT_STAT_KEYS,
  PITCH_STAT_KEYS,
} from '../lib/players';

function ScoreTile({ label, value, potential }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-center dark:bg-gray-900/40">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </div>
      <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        {value ?? '—'}
        {potential != null && (
          <span className="text-sm font-normal text-gray-400 dark:text-gray-500">
            {' '}
            / {potential}
          </span>
        )}
      </div>
    </div>
  );
}

function StatLine({ title, row, keys }) {
  const stats = pickPlayerStats(row, keys);
  if (stats.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h4>
      <div className="grid grid-cols-5 gap-x-2 gap-y-1 rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-900/40">
        {stats.map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] uppercase text-gray-400 dark:text-gray-500">
              {label}
            </div>
            <div className="text-sm font-medium tabular-nums text-gray-800 dark:text-gray-200">
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Scores are shown on the classic 20-80 scouting scale, computed from the
// player's tool ratings normalized against the league-wide scale.
export default function PlayerAnalysis({
  player,
  allRatingRows,
  teamName,
  ratingsStatus,
  onLoadRatings,
}) {
  if (!player) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-600 dark:text-gray-500">
        Select a player from the list to see their analysis.
      </div>
    );
  }

  const batAxes = buildToolAxes(player.rating, allRatingRows, BATTING_TOOLS);
  const pitchAxes = buildToolAxes(player.rating, allRatingRows, PITCHING_TOOLS);
  const defAxes = buildToolAxes(player.rating, allRatingRows, DEFENSE_TOOLS);
  const hasRatings = batAxes.length > 0 || pitchAxes.length > 0 || defAxes.length > 0;

  const scoreSets = [
    { label: 'Hitting', axes: batAxes },
    { label: 'Pitching', axes: pitchAxes },
    { label: 'Def / Athletic', axes: defAxes },
  ].filter((s) => s.axes.length > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {player.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {[player.position, player.age != null ? `Age ${player.age}` : null, teamName]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {hasRatings ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {scoreSets.map((s) => (
              <ScoreTile
                key={s.label}
                label={s.label}
                value={compositeScore(s.axes, 'value')}
                potential={
                  s.axes.some((a) => a.potential != null)
                    ? compositeScore(s.axes, 'potential')
                    : null
                }
              />
            ))}
          </div>
          <p className="mb-3 text-[11px] text-gray-400 dark:text-gray-500">
            Scores use the 20-80 scouting scale, normalized to this league's
            rating scale. Hover a point for exact values.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {batAxes.length > 0 && <RadarChart title="Batting tools" axes={batAxes} />}
            {pitchAxes.length > 0 && <RadarChart title="Pitching" axes={pitchAxes} />}
            {defAxes.length > 0 && (
              <RadarChart title="Defense & athleticism" axes={defAxes} />
            )}
          </div>
        </>
      ) : (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          {ratingsStatus === 'running' ? (
            'Ratings job is running — the radar charts will appear here when it finishes (usually 60-90 seconds).'
          ) : ratingsStatus === 'done' ? (
            'No tool ratings found for this player in the ratings export.'
          ) : (
            <>
              Tool ratings haven't been loaded yet. Click{' '}
              <button onClick={onLoadRatings} className="font-semibold underline">
                Load ratings
              </button>{' '}
              (requires being signed in to StatsPlus — use the header button).
            </>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <StatLine title="Batting stats" row={player.bat} keys={BAT_STAT_KEYS} />
        <StatLine title="Pitching stats" row={player.pitch} keys={PITCH_STAT_KEYS} />
      </div>
    </div>
  );
}
