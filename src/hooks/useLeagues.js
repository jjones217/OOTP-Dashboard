import { useEffect, useState, useCallback } from 'react';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { db, firebaseReady } from '../firebase';

const SAVE_TIMEOUT_MS = 8000;

// Firebase writes hang forever when database rules deny access, so wrap
// them in a timeout that surfaces a useful error instead.
function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out. Check your Firebase Realtime Database ` +
                'rules — reads and writes must be allowed.'
            )
          ),
        SAVE_TIMEOUT_MS
      )
    ),
  ]);
}

export function useLeagues() {
  const [leagues, setLeagues] = useState({});
  const [loading, setLoading] = useState(firebaseReady);
  const [error, setError] = useState(
    firebaseReady
      ? null
      : 'Firebase is not configured. Set the VITE_FIREBASE_* environment variables.'
  );

  useEffect(() => {
    if (!firebaseReady) return undefined;
    const leaguesRef = ref(db, 'leagues');
    const unsubscribe = onValue(
      leaguesRef,
      (snapshot) => {
        setLeagues(snapshot.val() || {});
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        setError(`Failed to load leagues: ${err.message}`);
      }
    );
    return unsubscribe;
  }, []);

  const addLeague = useCallback(async (league) => {
    if (!firebaseReady) throw new Error('Firebase is not configured.');
    const leaguesRef = ref(db, 'leagues');
    const newRef = push(leaguesRef);
    await withTimeout(
      set(newRef, { ...league, createdAt: Date.now() }),
      'Saving league'
    );
    return newRef.key;
  }, []);

  const updateLeague = useCallback(async (id, changes) => {
    if (!firebaseReady) throw new Error('Firebase is not configured.');
    await withTimeout(
      update(ref(db, `leagues/${id}`), changes),
      'Updating league'
    );
  }, []);

  const removeLeague = useCallback(async (id) => {
    if (!firebaseReady) throw new Error('Firebase is not configured.');
    await withTimeout(remove(ref(db, `leagues/${id}`)), 'Removing league');
  }, []);

  return { leagues, loading, error, addLeague, updateLeague, removeLeague };
}
