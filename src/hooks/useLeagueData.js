import { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchEndpoint,
  parseResponseText,
  extractSimDate,
  findTeamRow,
  extractExportStatus,
} from '../api/statsplus';
import { loadAllCached, saveCached } from '../lib/dataStore';
import { myTeamInfo } from '../lib/lgdata';

// /teams has no win-loss data at all (just {ID, Name, Nickname, Parent
// Team ID}) — /lgdata's nested teams+standings replaces it for both name
// and record.
const ENDPOINTS = ['date', 'exports', 'lgdata', 'teambatstats', 'teampitchstats'];

function deriveOverview(raw, teamId) {
  if (!raw.date && !raw.lgdata) return null;
  const info = raw.lgdata ? myTeamInfo(raw.lgdata, teamId) : {};
  return {
    simDate: raw.date ? extractSimDate(raw.date) : undefined,
    exportStatus: raw.exports ? extractExportStatus(raw.exports, teamId) : undefined,
    teamName: info.name,
    record: info.record,
    batting: raw.teambatstats ? findTeamRow(raw.teambatstats, teamId) : undefined,
    pitching: raw.teampitchstats ? findTeamRow(raw.teampitchstats, teamId) : undefined,
  };
}

// Dataflow: this hook never fetches on its own. It reads whatever was
// last pulled from StatsPlus and cached locally; `pull()` is the only
// thing that touches the network, triggered by the user (the card's ↻
// button).
export function useLeagueData(id, league) {
  const [data, setData] = useState(null);
  const [hasCache, setHasCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pulledAt, setPulledAt] = useState(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    (async () => {
      const cached = await loadAllCached(id);
      if (cancelled) return;
      const raw = {};
      let latest = null;
      for (const [ep, entry] of Object.entries(cached)) {
        raw[ep] = entry.data;
        if (!latest || entry.fetchedAt > latest) latest = entry.fetchedAt;
      }
      setData(deriveOverview(raw, league.teamId));
      setPulledAt(latest ? new Date(latest) : null);
      setHasCache(Object.keys(cached).length > 0);
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [id]);

  const pull = useCallback(async () => {
    if (!league?.lgurl) return;
    setLoading(true);
    setError(null);
    try {
      const raw = {};
      for (const ep of ENDPOINTS) {
        raw[ep] = await fetchEndpoint(league, ep);
        await saveCached(id, ep, raw[ep]);
        if (!aliveRef.current) return;
        setData(deriveOverview(raw, league.teamId));
      }
      setPulledAt(new Date());
      setHasCache(true);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err.message);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [id, league?.lgurl, league?.teamId]);

  // Manual import: for when the pull queue is rate-limited. The user
  // opens the endpoint URL in their own browser, copies the response,
  // and pastes it here — it's parsed and cached exactly like a pull.
  const importEndpoint = useCallback(
    async (endpoint, rawText) => {
      const parsed = parseResponseText(rawText);
      await saveCached(id, endpoint, parsed);
      const cached = await loadAllCached(id);
      const raw = {};
      let latest = null;
      for (const [ep, entry] of Object.entries(cached)) {
        raw[ep] = entry.data;
        if (!latest || entry.fetchedAt > latest) latest = entry.fetchedAt;
      }
      setData(deriveOverview(raw, league.teamId));
      setPulledAt(latest ? new Date(latest) : null);
      setHasCache(true);
      return Array.isArray(parsed) ? parsed.length : null;
    },
    [id, league?.teamId]
  );

  return { data, hasCache, loading, error, pulledAt, pull, importEndpoint };
}
