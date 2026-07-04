import { useMemo, useState } from 'react';
import { useLeagueDetail } from '../hooks/useLeagueDetail';
import { findTeamRow, extractTeamName, extractRecord } from '../api/statsplus';
import { buildPlayerIndex, pickPlayerStats, BAT_STAT_KEYS, PITCH_STAT_KEYS } from '../lib/players';
import PlayerAnalysis from './PlayerAnalysis';

function asRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

function teamNameById(teamsData) {
  const names = {};
  for (const row of asRows(teamsData)) {
    const id =
      row.team_id ?? row.teamid ?? row.id ?? row.ID ?? row.TeamID ?? row.tid;
    if (id === undefined) continue;
    names[String(id)] =
      row.name || row.Name || row.team_name || row.nickname || row.abbr || `Team ${id}`;
  }
  return names;
}

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- Standings: derived from /teams W-L (StatsPlus has no standings API) ---
function buildStandings(teamsData) {
  const source = teamsData;
  const names = teamNameById(teamsData);
  const rows = [];
  for (const row of asRows(source)) {
    const id =
      row.team_id ?? row.teamid ?? row.id ?? row.ID ?? row.TeamID ?? row.tid;
    const w = numeric(row.w ?? row.W ?? row.wins ?? row.Wins);
    const l = numeric(row.l ?? row.L ?? row.losses ?? row.Losses);
    if (w === null || l === null) continue;
    const games = w + l;
    rows.push({
      id: String(id ?? rows.length),
      name:
        names[String(id)] ||
        row.name || row.team_name || row.nickname || `Team ${id}`,
      w,
      l,
      pct: games > 0 ? w / games : 0,
      division:
        row.division ?? row.division_id ?? row.div ?? row.sub_league_id ?? null,
      league: row.league ?? row.league_id ?? row.lg ?? null,
    });
  }
  rows.sort((a, b) => b.pct - a.pct);

  // Group by league/division when those fields exist.
  const groups = new Map();
  for (const row of rows) {
    const key =
      row.league != null || row.division != null
        ? `${row.league != null ? `League ${row.league}` : ''}${
            row.league != null && row.division != null ? ' · ' : ''
          }${row.division != null ? `Division ${row.division}` : ''}`
        : 'Standings';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  // Games behind, per group.
  for (const rows2 of groups.values()) {
    const top = rows2[0];
    for (const r of rows2) {
      r.gb = ((top.w - r.w) + (r.l - top.l)) / 2;
    }
  }
  return groups;
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
                <th className="px-3 py-2 text-right">GB</th>
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
                    {r.pct.toFixed(3).replace(/^0/, '')}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                    {r.gb === 0 ? '—' : r.gb}
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

function TeamStatsTable({ title, data, names, keys, myTeamId }) {
  const rows = asRows(data);
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
    pull,
    ratings,
    ratingsStatus,
    ratingsError,
    ratingsPulledAt,
    pullRatings,
  } = useLeagueDetail(id, league);
  const hasCache = Object.keys(data).length > 0;
  const [tab, setTab] = useState('players');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState(String(league.teamId ?? 'all'));
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const names = useMemo(() => teamNameById(data.teams), [data.teams]);
  const players = useMemo(
    () =>
      buildPlayerIndex({
        players: data.players,
        batstats: data.playerbatstatsv2,
        pitchstats: data.playerpitchstatsv2,
        ratings,
      }),
    [data.players, data.playerbatstatsv2, data.playerpitchstatsv2, ratings]
  );
  const allRatingRows = useMemo(() => asRows(ratings), [ratings]);
  const standings = useMemo(() => buildStandings(data.teams), [data.teams]);

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
  const myTeamRow = findTeamRow(data.teams, league.teamId);

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
            {myTeamRow && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                {extractTeamName(myTeamRow)} {extractRecord(myTeamRow)}
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {pulledAt && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Last pulled {pulledAt.toLocaleTimeString()}
            </span>
          )}
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

      {!hasCache && !loading && (
        <div className="mb-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 py-10 text-center dark:border-gray-600">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No data pulled for this league yet.
          </p>
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
            names={names}
            keys={BAT_STAT_KEYS}
            myTeamId={league.teamId}
          />
          <TeamStatsTable
            title="Team pitching"
            data={data.teampitchstats}
            names={names}
            keys={PITCH_STAT_KEYS}
            myTeamId={league.teamId}
          />
        </div>
      )}
      </>
      )}
    </div>
  );
}
