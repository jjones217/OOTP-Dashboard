import { useState } from 'react';
import { fetchEndpoint, extractSimDate } from '../api/statsplus';

const LGURL_RE = /^[a-zA-Z0-9_-]+$/;

// Accepts either a bare slug ("myleague") or a full StatsPlus URL and
// returns the slug, or null if it can't be parsed.
function parseLgurl(input) {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (LGURL_RE.test(trimmed)) return trimmed;
  const match = trimmed.match(/statsplus\.net\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export default function LeagueModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [lgurlInput, setLgurlInput] = useState(initial?.lgurl || '');
  const [teamId, setTeamId] = useState(initial?.teamId || '');
  const [token, setToken] = useState(initial?.token || '');
  const [testState, setTestState] = useState(null); // null | 'testing' | 'ok' | 'fail'
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const lgurl = parseLgurl(lgurlInput);

  const handleTest = async () => {
    if (!lgurl) {
      setTestState('fail');
      setTestMessage('Enter a valid league URL or slug first.');
      return;
    }
    setTestState('testing');
    setTestMessage('');
    try {
      const data = await fetchEndpoint({ lgurl, token: token.trim() }, 'date');
      const simDate = extractSimDate(data);
      setTestState('ok');
      setTestMessage(simDate ? `Connected! Sim date: ${simDate}` : 'Connected!');
    } catch (err) {
      setTestState('fail');
      setTestMessage(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    if (!name.trim()) return setSaveError('League name is required.');
    if (!lgurl) return setSaveError('A valid StatsPlus league URL or slug is required.');
    if (!teamId.trim()) return setSaveError('Team ID is required.');

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        lgurl,
        teamId: teamId.trim(),
        token: token.trim(),
      });
      onClose();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {initial ? 'Edit League' : 'Add League'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              League name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My OOTP League"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              StatsPlus league URL or slug
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={lgurlInput}
                onChange={(e) => {
                  setLgurlInput(e.target.value);
                  setTestState(null);
                }}
                placeholder="https://statsplus.net/myleague"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testState === 'testing'}
                className="shrink-0 rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
              >
                {testState === 'testing' ? 'Testing…' : 'Test'}
              </button>
            </div>
            {testState === 'ok' && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                ✓ {testMessage}
              </p>
            )}
            {testState === 'fail' && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                ✗ {testMessage}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Your team ID
            </label>
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="e.g. 12"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {lgurl && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Find your team ID in the{' '}
                <a
                  href={`https://statsplus.net/${lgurl}/api/teams`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline dark:text-blue-400"
                >
                  teams list
                </a>
                .
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              API token <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Only needed for private leagues"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              autoComplete="off"
            />
          </div>

          {saveError && (
            <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {saveError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save League'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
