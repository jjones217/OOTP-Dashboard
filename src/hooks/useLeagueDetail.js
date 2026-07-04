import { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchEndpoint,
  extractYear,
  parseCsv,
  parseResponseText,
} from '../api/statsplus';
import { loadAllCached, saveCached } from '../lib/dataStore';

// Endpoints per https://wiki.statsplus.net/web-tools/statsplus-api.
// The player stat endpoints need the current season as ?year=, which comes
// from /date, so that request runs first. Each endpoint is independent: a
// failing one records an error and the rest of the view still works.
//
// Dataflow: nothing here fetches automatically. On mount, the hook reads
// whatever was last pulled and cached locally (instant, works offline).
// `pull()` is the explicit, user-triggered action that hits StatsPlus and
// overwrites the cache; `pullRatings()` does the same for the separate
// ratings job.
export function useLeagueDetail(id, league) {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [pulledAt, setPulledAt] = useState(null);

  const [ratings, setRatings] = useState(null);
  const [ratingsStatus, setRatingsStatus] = useState('idle'); // idle|running|done|error
  const [ratingsError, setRatingsError] = useState(null);
  const [ratingsPulledAt, setRatingsPulledAt] = useState(null);

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
        if (ep === 'ratings') continue;
        raw[ep] = entry.data;
        if (!latest || entry.fetchedAt > latest) latest = entry.fetchedAt;
      }
      setData(raw);
      setPulledAt(latest ? new Date(latest) : null);

      if (cached.ratings) {
        setRatings(cached.ratings.data);
        setRatingsStatus('done');
        setRatingsPulledAt(new Date(cached.ratings.fetchedAt));
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [id]);

  const pull = useCallback(async () => {
    setLoading(true);
    const raw = {};
    const errs = {};

    const grab = async (ep, params) => {
      try {
        raw[ep] = await fetchEndpoint(league, ep, params);
        await saveCached(id, ep, raw[ep]);
      } catch (err) {
        errs[ep] = err.message;
      }
      if (!aliveRef.current) return false;
      setData({ ...raw });
      setErrors({ ...errs });
      return true;
    };

    if (!(await grab('date'))) {
      setLoading(false);
      return;
    }
    const year = extractYear(raw.date);

    for (const ep of ['teams', 'players', 'teambatstats', 'teampitchstats']) {
      if (!(await grab(ep))) {
        setLoading(false);
        return;
      }
    }
    for (const ep of ['playerbatstatsv2', 'playerpitchstatsv2']) {
      if (!(await grab(ep, year ? { year } : undefined))) {
        setLoading(false);
        return;
      }
    }

    if (!aliveRef.current) return;
    setPulledAt(new Date());
    setLoading(false);
  }, [id, league?.lgurl]);

  const pullRatings = useCallback(async () => {
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
      await saveCached(id, 'ratings', rows);
      if (!aliveRef.current) return;
      setRatings(rows);
      setRatingsStatus('done');
      setRatingsPulledAt(new Date());
    } catch (err) {
      if (!aliveRef.current) return;
      setRatingsStatus('error');
      setRatingsError(err.message);
    }
  }, [id, league?.lgurl]);

  // Manual import: for when the pull queue is rate-limited. The user
  // opens the endpoint URL in their own browser, copies the response,
  // and pastes it here — it's parsed and cached exactly like a pull.
  const importEndpoint = useCallback(
    async (endpoint, rawText) => {
      if (endpoint === 'ratings' && /still in progress|^Request received/i.test(rawText.trim())) {
        throw new Error(
          'This looks like the "job in progress" placeholder, not the final ' +
            'CSV. Reload the ratings URL after ~60-90 seconds and paste what ' +
            'it shows then.'
        );
      }
      const parsed = parseResponseText(rawText);

      if (endpoint === 'ratings') {
        await saveCached(id, 'ratings', parsed);
        setRatings(parsed);
        setRatingsStatus('done');
        setRatingsPulledAt(new Date());
        return Array.isArray(parsed) ? parsed.length : null;
      }

      await saveCached(id, endpoint, parsed);
      const cached = await loadAllCached(id);
      const raw = {};
      let latest = null;
      for (const [ep, entry] of Object.entries(cached)) {
        if (ep === 'ratings') continue;
        raw[ep] = entry.data;
        if (!latest || entry.fetchedAt > latest) latest = entry.fetchedAt;
      }
      setData(raw);
      setPulledAt(latest ? new Date(latest) : null);
      return Array.isArray(parsed) ? parsed.length : null;
    },
    [id]
  );

  return {
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
    importEndpoint,
  };
}
