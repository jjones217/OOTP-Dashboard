import { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchEndpoint,
  extractSimDate,
  findTeamRow,
  extractRecord,
  extractTeamName,
  extractExportStatus,
} from '../api/statsplus';

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
      // Requests are spaced out by the global queue in api/statsplus.js.
      const dateData = await fetchEndpoint(league, 'date');
      const exportsData = await fetchEndpoint(league, 'exports');
      const teamsData = await fetchEndpoint(league, 'teams');
      const batData = await fetchEndpoint(league, 'teambatstats');
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

  // Data loads once when the card mounts; after that, refresh is manual
  // only (the ↻ button) — no background polling.
  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return { data, loading, error, updatedAt, refresh: load };
}
