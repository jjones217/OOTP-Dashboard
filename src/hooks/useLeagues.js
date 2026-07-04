import { useEffect, useState, useCallback, useRef } from 'react';
import { loadLeagues, saveLeagues } from '../storage';

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `lg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useLeagues() {
  const [leagues, setLeagues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const leaguesRef = useRef({});

  useEffect(() => {
    let alive = true;
    loadLeagues()
      .then((data) => {
        if (!alive) return;
        leaguesRef.current = data;
        setLeagues(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(`Failed to load leagues: ${err.message}`);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(async (next) => {
    leaguesRef.current = next;
    setLeagues(next);
    try {
      await saveLeagues(next);
      setError(null);
    } catch (err) {
      setError(`Failed to save leagues: ${err.message}`);
      throw err;
    }
  }, []);

  const addLeague = useCallback(
    async (league) => {
      const id = makeId();
      await persist({
        ...leaguesRef.current,
        [id]: { ...league, createdAt: Date.now() },
      });
      return id;
    },
    [persist]
  );

  const updateLeague = useCallback(
    async (id, changes) => {
      await persist({
        ...leaguesRef.current,
        [id]: { ...leaguesRef.current[id], ...changes },
      });
    },
    [persist]
  );

  const removeLeague = useCallback(
    async (id) => {
      const next = { ...leaguesRef.current };
      delete next[id];
      await persist(next);
    },
    [persist]
  );

  return { leagues, loading, error, addLeague, updateLeague, removeLeague };
}
