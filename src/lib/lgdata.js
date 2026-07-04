// Parses the /lgdata endpoint (a JSON object with leagues, subleagues,
// divisions, teams, and standings) — the real source of team names,
// division/league structure, and win-loss standings. The standalone
// /teams endpoint only returns {ID, Name, Nickname, Parent Team ID}, no
// standings at all, so /lgdata replaces it entirely in this app.
//
// /lgdata covers the ENTIRE org (majors, every minor-league affiliate,
// rookie ball, even HS/NCAA levels in some saves) in one response — a
// save can have 600+ teams. Name lookups use the full unfiltered list
// (so any player, at any level, resolves to a real name); standings are
// narrowed to just the league the user's own team plays in.

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

export function teamNamesFromLgdata(lgdata) {
  const names = {};
  for (const t of safeArray(lgdata?.teams)) {
    names[String(t.team_id)] =
      [t.name, t.nickname].filter(Boolean).join(' ') || `Team ${t.team_id}`;
  }
  return names;
}

// { w, l, pct } for one team, straight from the standings array — no
// derivation needed, StatsPlus already computes these.
export function myTeamInfo(lgdata, teamId) {
  const team = safeArray(lgdata?.teams).find((t) => String(t.team_id) === String(teamId));
  const name = team ? [team.name, team.nickname].filter(Boolean).join(' ') : undefined;
  const standing = safeArray(lgdata?.standings).find(
    (s) => String(s.team_id) === String(teamId)
  );
  return {
    name,
    record: standing ? `${standing.w}-${standing.l}` : undefined,
  };
}

// Standings grouped by division, narrowed to the league (league_id) the
// given team plays in — otherwise every level in the save would show at
// once. Falls back to showing everything if the team can't be found.
export function standingsFromLgdata(lgdata, myTeamId) {
  const teams = safeArray(lgdata?.teams);
  const standings = safeArray(lgdata?.standings);
  const divisions = safeArray(lgdata?.divisions);
  const subleagues = safeArray(lgdata?.subleagues);

  const myTeam = teams.find((t) => String(t.team_id) === String(myTeamId));
  const leagueId = myTeam ? myTeam.league_id : null;
  const leagueTeams = leagueId == null ? teams : teams.filter((t) => t.league_id === leagueId);
  const teamIds = new Set(leagueTeams.map((t) => t.team_id));
  const teamById = new Map(leagueTeams.map((t) => [t.team_id, t]));

  const divisionName = (lid, slid, did) => {
    const d = divisions.find(
      (dd) => dd.league_id === lid && dd.sub_league_id === slid && dd.division_id === did
    );
    return d?.name || `Division ${did}`;
  };
  const subLeagueName = (lid, slid) => {
    const s = subleagues.find((ss) => ss.league_id === lid && ss.sub_league_id === slid);
    return s?.name || null;
  };

  const groups = new Map();
  for (const s of standings) {
    if (!teamIds.has(s.team_id)) continue;
    const team = teamById.get(s.team_id);
    const name = team ? [team.name, team.nickname].filter(Boolean).join(' ') : `Team ${s.team_id}`;
    const subName = team ? subLeagueName(team.league_id, team.sub_league_id) : null;
    const divName = team ? divisionName(team.league_id, team.sub_league_id, team.division_id) : 'Standings';
    const key = subName ? `${subName} · ${divName}` : divName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      id: String(s.team_id),
      name,
      w: s.w,
      l: s.l,
      pct: s.pct,
      gb: s.gb,
      streak: s.streak,
    });
  }
  for (const g of groups.values()) g.sort((a, b) => b.pct - a.pct);
  return groups;
}
