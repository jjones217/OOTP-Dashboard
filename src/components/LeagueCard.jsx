import { useState } from 'react';
import { useLeagueData } from '../hooks/useLeagueData';
import ImportDataModal from './ImportDataModal';
import {
  pickPlayerStats,
  withPitchingRates,
  withBattingRates,
  BAT_STAT_KEYS,
  PITCH_STAT_KEYS,
} from '../lib/players';

function overviewImportEndpoints(league) {
  const base = `https://statsplus.net/${league.lgurl}/api`;
  return [
    { value: 'date', label: 'Sim date (date)', urlFor: () => `${base}/date/` },
    { value: 'exports', label: 'Exports (exports)', urlFor: () => `${base}/exports/` },
    { value: 'lgdata', label: 'League data (lgdata)', urlFor: () => `${base}/lgdata/` },
    {
      value: 'teambatstats',
      label: 'Team batting (teambatstats)',
      urlFor: () => `${base}/teambatstats/`,
    },
    {
      value: 'teampitchstats',
      label: 'Team pitching (teampitchstats)',
      urlFor: () => `${base}/teampitchstats/`,
    },
  ];
}

const STAT_LABELS = {
  batting: 'Batting',
  pitching: 'Pitching',
};

function ExportBadge({ exportStatus }) {
  if (!exportStatus) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        Export: unknown
      </span>
    );
  }
  const { exported } = exportStatus;
  const looksExported =
    exported !== undefined &&
    exported !== '0' &&
    exported !== 0 &&
    exported !== false &&
    exported !== 'no';
  return looksExported ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/50 dark:text-green-300">
      Exported{typeof exported === 'string' && exported.length > 3 ? `: ${exported}` : ''}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
      Not exported
    </span>
  );
}

export default function LeagueCard({ id, league, onEdit, onRemove, onOpen }) {
  const { data, hasCache, loading, error, pulledAt, pull, importEndpoint } =
    useLeagueData(id, league);
  const [statView, setStatView] = useState('batting');
  const [showImport, setShowImport] = useState(false);

  const statRow =
    statView === 'pitching'
      ? withPitchingRates(data?.pitching)
      : withBattingRates(data?.batting);
  const stats = pickPlayerStats(
    statRow,
    statView === 'batting' ? BAT_STAT_KEYS : PITCH_STAT_KEYS
  );

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {league.name}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            statsplus.net/{league.lgurl}
            {data?.teamName ? ` · ${data.teamName}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={pull}
            disabled={loading}
            title="Pull latest data from StatsPlus"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            {loading ? '⏳' : '⬇'}
          </button>
          <button
            onClick={() => setShowImport(true)}
            title="Import data manually (paste a response you fetched yourself)"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            📋
          </button>
          <button
            onClick={() => onEdit(id)}
            title="Edit league"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            ✎
          </button>
          <button
            onClick={() => onRemove(id)}
            title="Remove league"
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
          {/rate limit/i.test(error) && (
            <>
              {' '}
              <button onClick={() => setShowImport(true)} className="font-semibold underline">
                Import manually
              </button>{' '}
              instead.
            </>
          )}
        </div>
      )}

      {!hasCache && !loading && !error && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No data pulled yet.
          </p>
          <button
            onClick={pull}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            ⬇ Pull data
          </button>
        </div>
      )}

      {!hasCache && loading && (
        <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
          Pulling data from StatsPlus…
        </div>
      )}

      {data && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {data.simDate && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                Sim date: {data.simDate}
              </span>
            )}
            <ExportBadge exportStatus={data.exportStatus} />
            {data.record && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                {data.record}
              </span>
            )}
          </div>

          <div className="mt-auto">
            <div className="mb-2 flex items-center justify-between">
              <select
                value={statView}
                onChange={(e) => setStatView(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                {Object.entries(STAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {pulledAt && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  Pulled {pulledAt.toLocaleTimeString()}
                </span>
              )}
            </div>

            {stats.length > 0 ? (
              <div className="grid grid-cols-4 gap-x-2 gap-y-1 rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-900/40">
                {stats.map(([label, value]) => (
                  <div key={label}>
                    <div className="text-[10px] uppercase text-gray-400 dark:text-gray-500">
                      {label}
                    </div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No {STAT_LABELS[statView].toLowerCase()} stats found for team{' '}
                {league.teamId}.
              </p>
            )}
          </div>
        </>
      )}

      <button
        onClick={() => onOpen(id)}
        className="mt-3 w-full rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
      >
        Players & league data →
      </button>

      {showImport && (
        <ImportDataModal
          endpoints={overviewImportEndpoints(league)}
          onImport={importEndpoint}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
