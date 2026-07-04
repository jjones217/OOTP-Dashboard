import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchEndpoint, extractYear, parseCsv } from '../api/statsplus';

// Endpoints per https://wiki.statsplus.net/web-tools/statsplus-api.
// The player stat endpoints need the current season as ?year=, which comes
// from /date, so that request runs first. Each endpoint is independent: a
// failing one records an error and the rest of the view still works.
export function useLeagueDetail(league) {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  // Ratings are a separate on-demand job (takes ~60-90s on StatsPlus's
  // side and requires the user to be signed in), never auto-fetched.
  const [ratings, setRatings] = useState(null);
  const [ratingsStatus, setRatingsStatus] = useState('idle'); // idle|running|done|error
  const [ratingsError, setRatingsError] = useState(null);

  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = {};
    const errs = {};

    const grab = async (ep, params) => {
      try {
        results[ep] = await fetchEndpoint(league, ep, params);
      } catch (err) {
        errs[ep] = err.message;
      }
      if (!aliveRef.current) return false;
      // Stream results in as they arrive so the view fills progressively.
      setData({ ...results });
      setErrors({ ...errs });
      return true;
    };

    if (!(await grab('date'))) return;
    const year = extractYear(results.date);

    for (const ep of ['teams', 'players', 'teambatstats', 'teampitchstats']) {
      if (!(await grab(ep))) return;
    }
    for (const ep of ['playerbatstatsv2', 'playerpitchstatsv2']) {
      if (!(await grab(ep, year ? { year } : undefined))) return;
    }

    if (!aliveRef.current) return;
    setUpdatedAt(new Date());
    setLoading(false);
  }, [league?.lgurl]);

  const loadRatings = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.statsplusDesktop : null;
    if (!bridge?.ratings) {
      setRatingsStatus('error');
      setRatingsError(
        'Player ratings require the desktop app (they need your StatsPlus login).'
      );
      return;
    }
    setRatingsStatus('running');
    setRatingsError(null);
    try {
      const { ok, body } = await bridge.ratings({ lgurl: league.lgurl });
      if (!aliveRef.current) return;
      if (!ok) {
        let message = 'Ratings request failed.';
        try {
          message = JSON.parse(body).error || message;
        } catch {
          /* keep default */
        }
        setRatingsStatus('error');
        setRatingsError(message);
        return;
      }
      const rows = parseCsv(body);
      if (rows.length === 0) {
        setRatingsStatus('error');
        setRatingsError('Ratings job returned no data.');
        return;
      }
      setRatings(rows);
      setRatingsStatus('done');
    } catch (err) {
      if (!aliveRef.current) return;
      setRatingsStatus('error');
      setRatingsError(err.message);
    }
  }, [league?.lgurl]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return {
    data,
    errors,
    loading,
    updatedAt,
    refresh: load,
    ratings,
    ratingsStatus,
    ratingsError,
    loadRatings,
  };
}
