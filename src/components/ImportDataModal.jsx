import { useState } from 'react';

// Manual data import: for when the pull queue hits StatsPlus's rate
// limiter. The user opens an endpoint URL directly in their own browser
// (a fresh browser request isn't subject to this app's queue), copies the
// response body, and pastes it here. It's parsed and cached exactly like
// a normal pull, so every view in the app picks it up the same way.
export default function ImportDataModal({ endpoints, onImport, onClose }) {
  const [endpoint, setEndpoint] = useState(endpoints[0].value);
  const [text, setText] = useState('');
  const [year, setYear] = useState(endpoints[0].defaultYear ?? '');
  const [status, setStatus] = useState(null); // null | 'saving' | 'done' | 'error'
  const [message, setMessage] = useState('');

  const selected = endpoints.find((e) => e.value === endpoint);
  const url = selected?.urlFor ? selected.urlFor(selected.needsYear ? year : undefined) : null;

  const handleEndpointChange = (value) => {
    setEndpoint(value);
    setStatus(null);
    const next = endpoints.find((e) => e.value === value);
    setYear(next?.defaultYear ?? '');
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setStatus('saving');
    setMessage('');
    try {
      const count = await onImport(
        endpoint,
        text,
        selected.needsYear ? Number(year) : undefined
      );
      setStatus('done');
      setMessage(typeof count === 'number' ? `Saved — ${count} rows.` : 'Saved.');
      setText('');
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  const yearInvalid =
    selected.needsYear && (!year || !/^\d{4}$/.test(String(year)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import data manually"
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Import data manually
        </h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Rate-limited? Open the URL below in your own browser (signed in to
          StatsPlus if needed), copy the whole response, and paste it here.
          It's saved to the same local cache a pull would use.
        </p>

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Endpoint
        </label>
        <select
          value={endpoint}
          onChange={(e) => handleEndpointChange(e.target.value)}
          className="mb-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          {endpoints.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>

        {selected?.needsYear && (
          <div className="mb-2">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Season year
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setStatus(null);
              }}
              placeholder="e.g. 2052"
              className="w-32 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              This tags which season the pasted stats belong to, so multiple
              years can be imported and browsed separately.
            </p>
          </div>
        )}

        {url && (
          <p className="mb-3 break-all text-xs text-gray-400 dark:text-gray-500">
            URL: <code>{url}</code>
          </p>
        )}
        {selected?.hint && (
          <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
            {selected.hint}
          </p>
        )}

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Paste response, or{' '}
          <span className="cursor-pointer text-blue-600 underline dark:text-blue-400">
            choose a file
            <input
              type="file"
              accept=".json,.csv,.txt"
              onChange={handleFile}
              className="hidden"
            />
          </span>
        </label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus(null);
          }}
          rows={10}
          placeholder="Paste the JSON or CSV response here…"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />

        {status === 'error' && (
          <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {message}
          </div>
        )}
        {status === 'done' && (
          <div className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
            {message}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Close
          </button>
          <button
            onClick={handleImport}
            disabled={!text.trim() || status === 'saving' || yearInvalid}
            title={yearInvalid ? 'Enter a valid 4-digit season year first' : undefined}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'saving' ? 'Saving…' : 'Save to cache'}
          </button>
        </div>
      </div>
    </div>
  );
}
