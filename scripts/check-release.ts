import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readMcdToken } from '../server/token';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const secrets = [readMcdToken(), process.env.DASHSCOPE_API_KEY].filter((value): value is string => Boolean(value));
const forbidden = files.filter((file) => /(^|\/)(node_modules|dist|\.git|private)\//.test(file) || /(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith('.env.example') || /\.(log|tsbuildinfo)$/.test(file));
const secretFiles: string[] = [];
for (const file of files) {
  const content = await readFile(file);
  if (secrets.some((secret) => content.includes(Buffer.from(secret)))) secretFiles.push(file);
}
const required = ['README.md', 'CONTEST_DECLARATION.md', 'MCP_INTEGRATION.md', 'mcp-config.example.json', 'SKILL.md'];
const missing = required.filter((file) => !files.includes(file));
const declaration = await readFile('CONTEST_DECLARATION.md', 'utf8');
let official: string;
if (process.platform === 'win32') {
  official = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/M-China/mcd-developer-innovation-challenge/main/CONTEST_DECLARATION.md' -TimeoutSec 20).Content"],
    { encoding: 'utf8', windowsHide: true, timeout: 25_000, stdio: ['ignore', 'pipe', 'ignore'] });
} else {
  const response = await fetch('https://raw.githubusercontent.com/M-China/mcd-developer-innovation-challenge/main/CONTEST_DECLARATION.md', {signal: AbortSignal.timeout(20_000)});
  if (!response.ok) throw new Error('无法读取官方参赛声明，未确认一致性。');
  official = await response.text();
}
const normalize = (value: string) => value.replaceAll('\r\n', '\n').trimEnd();
const declarationMatches = normalize(declaration) === normalize(official);
const issueBody = await readFile('docs/CONTEST_ISSUE.md', 'utf8');
console.log(JSON.stringify({ trackedFileCount: files.length, forbiddenFiles: forbidden, filesContainingActualCredentials: secretFiles,
  requiredFilesMissing: missing, declarationMatches, issueBodyCharacters: issueBody.trim().length }, null, 2));
if (forbidden.length || secretFiles.length || missing.length || !declarationMatches || issueBody.trim().length > 1000) process.exitCode = 1;
