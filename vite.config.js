import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only middleware that mirrors api/proxy.js so `npm run dev` works
// without `vercel dev`. In production, Vercel serves api/proxy.js.
function statsplusDevProxy() {
  const ALLOWED_ENDPOINTS = new Set([
    'date',
    'exports',
    'lgdata',
    'teams',
    'teambatstats',
    'teampitchstats',
    'players',
    'playerbatstatsv2',
    'playerpitchstatsv2',
    'playerfieldstatsv2',
    'gamehistory',
  ]);
  const ALLOWED_PARAMS = ['year', 'split', 'pid', 'lid'];
  const LGURL_RE = /^[a-zA-Z0-9_-]+$/;

  return {
    name: 'statsplus-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const lgurl = params.get('lgurl');
        const endpoint = params.get('endpoint');

        const fail = (status, error) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error }));
        };

        if (!lgurl || !LGURL_RE.test(lgurl)) return fail(400, 'Invalid or missing lgurl');
        if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
          return fail(400, 'Invalid or missing endpoint');
        }

        const url = new URL(`https://statsplus.net/${lgurl}/api/${endpoint}/`);
        for (const key of ALLOWED_PARAMS) {
          const v = params.get(key);
          if (v) url.searchParams.set(key, v);
        }

        try {
          const upstream = await fetch(url, {
            headers: { 'User-Agent': 'ootp-dashboard (dev)' },
          });
          const text = await upstream.text();
          if (upstream.status === 429) {
            return fail(429, 'StatsPlus rate limit hit. Wait a few minutes and try again.');
          }
          if (!upstream.ok) {
            return fail(upstream.status, `StatsPlus returned ${upstream.status}`);
          }
          res.statusCode = 200;
          try {
            JSON.parse(text);
            res.setHeader('Content-Type', 'application/json');
          } catch {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          res.end(text);
        } catch (err) {
          fail(502, `Upstream request failed: ${err.message}`);
        }
      });
    },
  };
}

export default defineConfig({
  // Relative base so the built app also works from file:// in Electron.
  base: './',
  plugins: [react(), statsplusDevProxy()],
});
