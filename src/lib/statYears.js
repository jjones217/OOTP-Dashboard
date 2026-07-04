// Cache keying for season-specific stat endpoints (playerbatstatsv2,
// playerpitchstatsv2). Each season is stored under its own cache key —
// "<endpoint>:<year>" — so multiple years can be pulled or imported and
// browsed independently instead of the latest overwriting the rest.

export function statKey(endpoint, year) {
  return year ? `${endpoint}:${year}` : endpoint;
}

// All years cached for a given endpoint prefix, newest first.
export function collectYears(data, endpoint) {
  const re = new RegExp(`^${endpoint}:(\\d{4})$`);
  const years = new Set();
  for (const key of Object.keys(data)) {
    const m = key.match(re);
    if (m) years.add(Number(m[1]));
  }
  return [...years].sort((a, b) => b - a);
}
