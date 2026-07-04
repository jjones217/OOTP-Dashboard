import { useState, useEffect } from 'react';
import { useLeagues } from './hooks/useLeagues';
import LeagueCard from './components/LeagueCard';
import LeagueModal from './components/LeagueModal';
import LeagueDetail from './components/LeagueDetail';

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.theme = dark ? 'dark' : 'light';
  }, [dark]);
  return [dark, setDark];
}

export default function App() {
  const { leagues, loading, error, addLeague, updateLeague, removeLeague } =
    useLeagues();
  const [dark, setDark] = useDarkMode();
  const [modal, setModal] = useState(null); // null | 'add' | leagueId
  const [openLeagueId, setOpenLeagueId] = useState(null);

  const leagueEntries = Object.entries(leagues);
  const editingLeague = modal && modal !== 'add' ? leagues[modal] : null;

  const handleSave = async (league) => {
    if (modal === 'add') {
      await addLeague(league);
    } else {
      await updateLeague(modal, league);
    }
  };

  const handleRemove = async (id) => {
    const league = leagues[id];
    if (
      window.confirm(`Remove "${league?.name || 'this league'}" from the dashboard?`)
    ) {
      await removeLeague(id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              ⚾ OOTP League Dashboard
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Data pulled from StatsPlus on request, cached on this computer
            </p>
          </div>
          <div className="flex items-center gap-2">
            {typeof window !== 'undefined' && window.statsplusDesktop?.login && (
              <button
                onClick={() => window.statsplusDesktop.login()}
                title="Sign in to StatsPlus in a browser window. Needed for player ratings; your login is remembered."
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Sign in to StatsPlus
              </button>
            )}
            <button
              onClick={() => setDark(!dark)}
              title="Toggle dark mode"
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => setModal('add')}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add League
            </button>
          </div>
        </div>
      </header>

      {openLeagueId && leagues[openLeagueId] && (
        <LeagueDetail
          key={openLeagueId}
          id={openLeagueId}
          league={leagues[openLeagueId]}
          onBack={() => setOpenLeagueId(null)}
        />
      )}

      {/* The dashboard stays mounted while a league is open so the cards
          don't refetch when navigating back. */}
      <main
        className={`mx-auto max-w-6xl px-4 py-6 ${
          openLeagueId && leagues[openLeagueId] ? 'hidden' : ''
        }`}
      >
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <p className="py-12 text-center text-gray-400 dark:text-gray-500">
            Loading leagues…
          </p>
        )}

        {!loading && !error && leagueEntries.length === 0 && (
          <div className="py-16 text-center">
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              No leagues configured yet.
            </p>
            <button
              onClick={() => setModal('add')}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add your first league
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagueEntries.map(([id, league]) => (
            <LeagueCard
              key={id}
              id={id}
              league={league}
              onEdit={setModal}
              onRemove={handleRemove}
              onOpen={setOpenLeagueId}
            />
          ))}
        </div>
      </main>

      {modal && (
        <LeagueModal
          initial={editingLeague}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
