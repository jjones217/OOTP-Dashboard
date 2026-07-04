// Vercel serverless function that proxies StatsPlus API requests.
// StatsPlus has no CORS headers, so the browser can't call it directly.
// This file must stay CommonJS (see api/package.json) because the root
// package.json sets "type": "module" for the Vite app.

const ALLOWED_ENDPOINTS = new Set([
  'date',
  'exports',
  'lgdata',
  'teams',
  'teambatstats',
  'teampitchstats',
  'players',
  'batstats',
  'pitchstats',
  'standings',
  'ratings',
  'tradeblock',
]);

// League URL slugs are simple path segments, e.g. "myleague".
const LGURL_RE = /^[a-zA-Z0-9_-]+$/;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lgurl, endpoint, token } = req.query;

  if (!lgurl || !LGURL_RE.test(lgurl)) {
    return res.status(400).json({ error: 'Invalid or missing lgurl' });
  }
  if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
    return res.status(400).json({ error: 'Invalid or missing endpoint' });
  }

  const url = new URL(`https://statsplus.net/${lgurl}/api/${endpoint}`);
  if (token) {
    url.searchParams.set('token', token);
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { 'User-Agent': 'ootp-dashboard (ootp.navhawk.net)' },
    });
  } catch (err) {
    return res.status(502).json({ error: `Upstream request failed: ${err.message}` });
  }

  const text = await upstream.text();

  if (upstream.status === 429) {
    return res.status(429).json({
      error: 'StatsPlus rate limit hit. Wait a few minutes and try again.',
    });
  }
  if (!upstream.ok) {
    return res.status(upstream.status).json({
      error: `StatsPlus returned ${upstream.status}`,
      body: text.slice(0, 500),
    });
  }

  // StatsPlus returns JSON for most endpoints and CSV for some.
  // Pass JSON through as JSON; anything else goes back as plain text.
  try {
    const json = JSON.parse(text);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(json);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).send(text);
  }
};
