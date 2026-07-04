// Populated at build time by .github/workflows/desktop.yml (VITE_BUILD_*
// env vars), which stamps every CI build with a monotonically increasing
// number (the GitHub Actions run number) and the commit it built from.
// Local `npm run build`/`npm run dev` runs have none of these set, so the
// app just shows "dev build" instead.
export const buildInfo = {
  version: import.meta.env.VITE_BUILD_VERSION || null,
  buildNumber: import.meta.env.VITE_BUILD_NUMBER || null,
  commit: import.meta.env.VITE_BUILD_COMMIT || null,
};

export function formatBuildLabel() {
  const { version, buildNumber, commit } = buildInfo;
  if (!version && !buildNumber) return 'dev build';
  const parts = [];
  if (version) parts.push(`v${version}`);
  else if (buildNumber) parts.push(`build ${buildNumber}`);
  if (commit) parts.push(commit);
  return parts.join(' · ');
}
