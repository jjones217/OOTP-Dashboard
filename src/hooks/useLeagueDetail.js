import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchEndpoint } from '../api/statsplus';

// Endpoints for the league detail view. Each is independent: leagues/hosts
// differ in what they expose, so a failing endpoint just records an error
// and the rest of the view still works.
const ENDPOINTS = [
  'teams',
  'players',
  'batstats',
  'pitchstats',
  'ratings',
  'standings',
  'teambatstats',
  'teampitchstats',
];

export function useLeagueDetail(league) {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = {};
    const errs = {};
    for (const ep of ENDPOINTS) {
      try {
        results[ep] = await fetchEndpoint(league, ep);
      } catch (err) {
        errs[ep] = err.message;
      }
      if (!aliveRef.current) return;
      // Stream results in as they arrive so the view fills progressively.
      setData({ ...results });
      setErrors({ ...errs });
    }
    if (!aliveRef.current) return;
    setUpdatedAt(new Date());
    setLoading(false);
  }, [league?.lgurl, league?.token]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return { data, errors, loading, updatedAt, refresh: load };
}
