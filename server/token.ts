import { execFileSync } from 'node:child_process';

/** Read only the requested variable; never enumerate or log credentials. */
export function readMcdToken(): string | undefined {
  const inherited = process.env.MCD_MCP_TOKEN?.trim();
  if (inherited) return inherited;
  if (process.platform !== 'win32') return undefined;

  // A running desktop app may predate a newly added Windows environment variable.
  // Capture the registry-backed value in memory without changing system settings.
  try {
    const value = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        "$token = [Environment]::GetEnvironmentVariable('MCD_MCP_TOKEN', 'User'); if ([string]::IsNullOrWhiteSpace($token)) { $token = [Environment]::GetEnvironmentVariable('MCD_MCP_TOKEN', 'Machine') }; if ($token) { [Console]::Write($token) }"],
      { encoding: 'utf8', windowsHide: true, timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
