import { useEffect, useMemo, useRef, useState } from 'react';
import { useLeagueDetail } from '../hooks/useLeagueDetail';
import { extractYear, filterSeasonTotals } from '../api/statsplus';
import {
  buildPlayerIndex,
  pickPlayerStats,
  withPitchingRates,
  withBattingRates,
  BAT_STAT_KEYS,
  PITCH_STAT_KEYS,
} from '../lib/players';
import { statKey, collectYears } from '../lib/statYears';
import { teamNamesFromLgdata, standingsFromLgdata, myTeamInfo } from '../lib/lgdata';
import PlayerAnalysis from './PlayerAnalysis';
import ImportDataModal from './ImportDataModal';

function detailImportEndpoints(league, seasonYear) {
  const base = `https://statsplus.net/${league.lgurl}/api`;
  return [
    { value: 'date', label: 'Sim date (date)', urlFor: () => `${base}/date/` },
    { value: 'lgdata', label: 'League data (lgdata)', urlFor: () => `${base}/lgdata/` },
    { value: 'players', label: 'Players (players)', urlFor: () => `${base}/players/` },
    {
      value: 'teambatstats',
      label: 'Team batting (teambatstats)',
      urlFor: () => `${base}/teambatstats/`,
    },
    {
      value: 'teampitchstats',
      label: 'Team pitching (teampitchstats)',
      urlFor: () => `${base}/teampitchstats/`,
    },
    {
      value: 'playerbatstatsv2',
      label: 'Player batting (playerbatstatsv2)',
      needsYear: true,
      defaultYear: seasonYear || '',
      urlFor: (year) => `${base}/playerbatstatsv2/?year=${year || '<season year>'}`,
    },
    {
      value: 'playerpitchstatsv2',
      label: 'Player pitching (playerpitchstatsv2)',
      needsYear: true,
      defaultYear: seasonYear || '',
      urlFor: (year) => `${base}/playerpitchstatsv2/?year=${year || '<season year>'}`,
    },
    {
      value: 'playerfieldstatsv2',
      label: 'Player fielding (playerfieldstatsv2)',
      needsYear: true,
      defaultYear: seasonYear || '',
      urlFor: (year) => `${base}/playerfieldstatsv2/?year=${year || '<season year>'}`,
    },
    {
      value: 'ratings',
      label: 'Ratings (ratings)',
      urlFor: () => `${base}/ratings/`,
      hint:
        'Ratings is an async job on StatsPlus\'s side — visit this URL, ' +
        'wait ~60-90 seconds, reload, and paste the CSV it shows then (not ' +
        'the "in progress" message).',
    },
  ];
}

function asRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

function formatStreak(s) {
  if (s === null || s === undefined) return '';
  return s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '-';
}

function StandingsTables({ groups, myTeamId }) {
  if (groups.size === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500">
        No standings data available in this league's API.
      </p>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[...groups.entries()].map(([label, rows]) => (
        <div key={label} className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                <th className="px-3 py-2">{label}</th>
                <th className="px-2 py-2 text-right">W</th>
                <th className="px-2 py-2 text-right">L</th>
                <th className="px-2 py-2 text-right">PCT</th>
                <th className="px-2 py-2 text-right">GB</th>
                <th className="px-3 py-2 text-right">STRK</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-gray-100 dark:border-gray-700/50 ${
                    String(myTeamId) === r.id
                      ? 'bg-blue-50 font-medium dark:bg-blue-900/20'
                      : ''
                  }`}
                >
                  <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">{r.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">{r.w}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">{r.l}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                    {Number(r.pct).toFixed(3).replace(/^0/, '')}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                    {!r.gb ? '—' : r.gb}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                    {formatStreak(r.streak)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function TeamStatsTable({ title, data, names, keys, myTeamId, transformRow }) {
  const rows = filterSeasonTotals(asRows(data)).map((r) =>
    transformRow ? transformRow(r) : r
  );
  if (rows.length === 0) return null;
  const columns = pickPlayerStats(rows[0], keys).map(([label]) => label);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              <th className="px-3 py-2">Team</th>
              {columns.map((c) => (
                <th key={c} className="px-2 py-2 text-right">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const id =
                row.team_id ?? row.teamid ?? row.id ?? row.ID ?? row.tid;
              const stats = pickPlayerStats(row, keys);
              return (
                <tr
                  key={id ?? i}
                  className={`border-t border-gray-100 dark:border-gray-700/50 ${
                    String(myTeamId) === String(id)
                      ? 'bg-blue-50 font-medium dark:bg-blue-900/20'
                      : ''
                  }`}
                >
                  <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">
                    {names[String(id)] || `Team ${id ?? i + 1}`}
                  </td>
                  {stats.map(([label, value]) => (
                    <td key={label} className="px-2 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                      {value}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LeagueDetail({ id, league, onBack }) {
  const {
    data,
    errors,
    loading,
    pulledAt,
    pullStatus,
    pull,
    pullSeason,
    ratings,
    ratingsStatus,
    ratingsError,
    ratingsPulledAt,
    pullRatings,
    importEndpoint,
  } = useLeagueDetail(id, league);
  const hasCache = Object.keys(data).length > 0;
  const [tab, setTab] = useState('players');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState(String(league.teamId ?? 'all'));
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [pullYear, setPullYear] = useState('');
  const [seasonPullError, setSeasonPullError] = useState(null);

  const names = useMemo(() => teamNamesFromLgdata(data.lgdata), [data.lgdata]);
  const seasonYear = useMemo(() => extractYear(data.date), [data.date]);

  // Player batting/pitching stats are cached per season (playerbatstatsv2:
  // <year>), so multiple pulled/imported years coexist. This is the list
  // of years actually available, and which one the Players tab is showing.
  const batYears = useMemo(() => collectYears(data, 'playerbatstatsv2'), [data]);
  const pitchYears = useMemo(() => collectYears(data, 'playerpitchstatsv2'), [data]);
  const fieldYears = useMemo(() => collectYears(data, 'playerfieldstatsv2'), [data]);
  const statYears = useMemo(
    () => [...new Set([...batYears, ...pitchYears, ...fieldYears])].sort((a, b) => b - a),
    [batYears, pitchYears, fieldYears]
  );
  const [selectedYear, setSelectedYearState] = useState(null);
  const yearPickedManuallyRef = useRef(false);
  const pickYear = (y) => {
    yearPickedManuallyRef.current = true;
    setSelectedYearState(y);
  };
  // Auto-follows the newest available season (or the in-game current
  // season, if cached) as more years get pulled or imported — right up
  // until the user manually picks one from the dropdown, at which point
  // their choice sticks even as further years are added.
  useEffect(() => {
    if (statYears.length === 0) {
      if (selectedYear !== null) setSelectedYearState(null);
      return;
    }
    if (
      yearPickedManuallyRef.current &&
      selectedYear !== null &&
      statYears.includes(selectedYear)
    ) {
      return;
    }
    const preferred = statYears.includes(seasonYear) ? seasonYear : statYears[0];
    if (preferred !== selectedYear) setSelectedYearState(preferred);
  }, [statYears, seasonYear]);

  const players = useMemo(
    () =>
      buildPlayerIndex({
        players: data.players,
        batstats: data[statKey('playerbatstatsv2', selectedYear)],
        pitchstats: data[statKey('playerpitchstatsv2', selectedYear)],
        fieldstats: data[statKey('playerfieldstatsv2', selectedYear)],
        ratings,
      }),
    [data, selectedYear, ratings]
  );
  const allRatingRows = useMemo(() => asRows(ratings), [ratings]);
  const standings = useMemo(
    () => standingsFromLgdata(data.lgdata, league.teamId),
    [data.lgdata, league.teamId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (teamFilter !== 'all' && String(p.teamId) !== teamFilter) return false;
      if (roleFilter === 'batters' && p.isPitcher) return false;
      if (roleFilter === 'pitchers' && !p.isPitcher) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, search, teamFilter, roleFilter]);

  const selected = players.find((p) => p.id === selectedId) || null;
  const myInfo = useMemo(() => myTeamInfo(data.lgdata, league.teamId), [data.lgdata, league.teamId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <button
            onClick={onBack}
            className="mb-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ← All leagues
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {league.name}
            {myInfo?.name && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                {myInfo.name} {myInfo.record}
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {pulledAt && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {loading && pullStatus ? pullStatus : `Last pulled ${pulledAt.toLocaleTimeString()}`}
            </span>
          )}
          <button
            onClick={() => setShowImport(true)}
            title="Paste a response you fetched yourself (useful if rate-limited)"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            📋 Import manually
          </button>
          <button
            onClick={pull}
            disabled={loading}
            title="Fetch the latest data from StatsPlus and cache it on this computer"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Pulling…' : '⬇ Pull latest data'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Pull player season
        </span>
        <input
          type="number"
          value={pullYear}
          onChange={(e) => {
            setPullYear(e.target.value);
            setSeasonPullError(null);
          }}
          placeholder={seasonYear ? String(seasonYear - 1) : '2052'}
          className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <button
          onClick={() => {
            setSeasonPullError(null);
            pullSeason(Number(pullYear)).catch((err) => setSeasonPullError(err.message));
          }}
          disabled={loading || !/^\d{4}$/.test(String(pullYear))}
          title="Pull batting, pitching, and fielding player stats for this year"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Pull player data
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Saves batting, pitching, and fielding locally for that season.
        </span>
        {seasonPullError && (
          <span className="text-xs text-red-600 dark:text-red-300">{seasonPullError}</span>
        )}
      </div>

      {!hasCache && !loading && (
        <div className="mb-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 py-10 text-center dark:border-gray-600">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No data pulled for this league yet.
          </p>
          {loading && pullStatus && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{pullStatus}</p>
          )}
          <button
            onClick={pull}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            ⬇ Pull data
          </button>
        </div>
      )}

      {(hasCache || loading) && (
      <>
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {[
          ['players', 'Players'],
          ['league', 'League'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === value
                ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'players' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="w-56 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="all">All teams</option>
              {Object.entries(names).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                  {String(league.teamId) === id ? ' (my team)' : ''}
                </option>
              ))}
            </select>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="all">Batters & pitchers</option>
              <option value="batters">Batters</option>
              <option value="pitchers">Pitchers</option>
            </select>
            {statYears.length > 0 && (
              <select
                value={selectedYear ?? ''}
                onChange={(e) => pickYear(Number(e.target.value))}
                title="Stats season — pull or import more years to add to this list"
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                {statYears.map((y) => (
                  <option key={y} value={y}>
                    {y} stats
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {filtered.length} players
            </span>

            <span className="ml-auto flex items-center gap-2">
              {ratingsStatus === 'idle' && (
                <button
                  onClick={pullRatings}
                  className="rounded-md border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                  title="StatsPlus generates the ratings export on their side; it takes about 60-90 seconds"
                >
                  ⬇ Pull ratings (~90s)
                </button>
              )}
              {ratingsStatus === 'running' && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ⏳ Ratings job running… usually 60-90s
                </span>
              )}
              {ratingsStatus === 'done' && (
                <>
                  <span className="text-sm text-green-600 dark:text-green-400">
                    ✓ Ratings pulled{ratingsPulledAt ? ` ${ratingsPulledAt.toLocaleTimeString()}` : ''}
                  </span>
                  <button
                    onClick={pullRatings}
                    title="Pull a fresh ratings export"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    ⬇
                  </button>
                </>
              )}
              {ratingsStatus === 'error' && (
                <button
                  onClick={pullRatings}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  title={ratingsError || ''}
                >
                  Ratings failed — retry
                </button>
              )}
            </span>
          </div>

          {ratingsStatus === 'error' && ratingsError && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {ratingsError}
            </div>
          )}

          {players.length === 0 && !loading && pulledAt && (
            <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              No player data found in the last pull.
              {Object.entries(errors).length > 0 && (
                <span>
                  {' '}Endpoint errors:{' '}
                  {Object.entries(errors)
                    .map(([ep, msg]) => `${ep} (${msg})`)
                    .join(', ')}
                </span>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    <th className="px-3 py-2">Player</th>
                    <th className="px-2 py-2">Pos</th>
                    <th className="px-2 py-2 text-right">Age</th>
                    <th className="px-3 py-2">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-700/40 ${
                        selectedId === p.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-200">
                        {p.name}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">
                        {p.position || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {p.age ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
                        {names[String(p.teamId)] || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && players.length > 0 && (
                <p className="p-4 text-center text-sm text-gray-400">No matches.</p>
              )}
            </div>

            <PlayerAnalysis
              player={selected}
              allRatingRows={allRatingRows}
              teamName={selected ? names[String(selected.teamId)] : null}
              ratingsStatus={ratingsStatus}
              onLoadRatings={pullRatings}
              statsYear={selectedYear}
            />
          </div>
        </>
      )}

      {tab === 'league' && (
        <div className="space-y-6">
          <StandingsTables groups={standings} myTeamId={league.teamId} />
          <TeamStatsTable
            title="Team batting"
            data={data.teambatstats}
            transformRow={withBattingRates}
            names={names}
            keys={BAT_STAT_KEYS}
            myTeamId={league.teamId}
          />
          <TeamStatsTable
            title="Team pitching"
            data={data.teampitchstats}
            transformRow={withPitchingRates}
            names={names}
            keys={PITCH_STAT_KEYS}
            myTeamId={league.teamId}
          />
        </div>
      )}
      </>
      )}

      {showImport && (
        <ImportDataModal
          endpoints={detailImportEndpoints(league, selectedYear || seasonYear)}
          onImport={importEndpoint}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
