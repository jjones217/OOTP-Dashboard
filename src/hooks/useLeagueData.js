import { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchEndpoint,
  extractSimDate,
  findTeamRow,
  extractRecord,
  extractTeamName,
  extractExportStatus,
} from '../api/statsplus';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Small delay between endpoint calls to stay friendly with the
// StatsPlus rate limiter.
const STAGGER_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function useLeagueData(league) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    if (!league?.lgurl) return;
    setLoading(true);
    setError(null);
    try {
      const dateData = await fetchEndpoint(league, 'date');
      await sleep(STAGGER_MS);
      const exportsData = await fetchEndpoint(league, 'exports');
      await sleep(STAGGER_MS);
      const teamsData = await fetchEndpoint(league, 'teams');
      await sleep(STAGGER_MS);
      const batData = await fetchEndpoint(league, 'teambatstats');
      await sleep(STAGGER_MS);
      const pitchData = await fetchEndpoint(league, 'teampitchstats');

      if (!aliveRef.current) return;

      const teamRow = findTeamRow(teamsData, league.teamId);
      setData({
        simDate: extractSimDate(dateData),
        exportStatus: extractExportStatus(exportsData, league.teamId),
        teamRow,
        teamName: extractTeamName(teamRow),
        record: extractRecord(teamRow),
        batting: findTeamRow(batData, league.teamId),
        pitching: findTeamRow(pitchData, league.teamId),
      });
      setUpdatedAt(new Date());
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err.message);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [league?.lgurl, league?.teamId, league?.token]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(interval);
    };
  }, [load]);

  return { data, loading, error, updatedAt, refresh: load };
}
