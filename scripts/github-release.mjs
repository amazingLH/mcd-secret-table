import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const owner = 'amazingLH';
const repo = 'mcd-secret-table';
const contest = 'M-China/mcd-developer-innovation-challenge';
const repositoryUrl = `https://github.com/${owner}/${repo}`;
const raw = execFileSync('git', ['credential', 'fill'], {
  input: `protocol=https\nhost=github.com\nusername=${owner}\n\n`,
  encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
});
const credentials = Object.fromEntries(raw.trim().split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
if (!credentials.password) throw new Error('No existing GitHub credential available.');
const headers = { Authorization: `Bearer ${credentials.password}`,
  Accept: 'application/vnd.github+json', 'User-Agent': 'SecretTable-release',
  'X-GitHub-Api-Version': '2022-11-28' };

async function api(method, path, body, allowNotFound = false) {
  const response = await fetch(`https://api.github.com${path}`, {
    method, signal: AbortSignal.timeout(25_000), headers: { ...headers, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    // Error bodies and credentials are deliberately not logged.
    throw new Error(`GitHub ${method} ${path} failed: HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const viewer = await api('GET', '/user');
  if (viewer.login !== owner) throw new Error('Authenticated account differs from the verified project owner.');
  const mode = process.argv[2] || 'inspect';
  const repositoryPath = `/repos/${owner}/${repo}`;
  if (mode === 'inspect') {
    const repository = await api('GET', repositoryPath, undefined, true);
    console.log(JSON.stringify({ owner: viewer.login, id: viewer.id, repositoryExists: Boolean(repository),
      repository: repository?.html_url ?? repositoryUrl, public: repository ? !repository.private : null }));
  } else if (mode === 'create') {
    const existing = await api('GET', repositoryPath, undefined, true);
    if (existing) {
      if (existing.private || existing.description !== '麦麦密桌 SecretTable：浏览器本地偏好评估 + 千问 Agent 协商 + 麦当劳 MCP 官方核价') throw new Error('Existing repository does not match this publication.');
      console.log(JSON.stringify({ repository: existing.html_url, reused: true })); return;
    }
    const result = await api('POST', '/user/repos', { name: repo, private: false, auto_init: false,
      description: '麦麦密桌 SecretTable：浏览器本地偏好评估 + 千问 Agent 协商 + 麦当劳 MCP 官方核价',
      has_issues: true, has_projects: false, has_wiki: false });
    console.log(JSON.stringify({ repository: result.html_url, public: !result.private, created: true }));
  } else if (mode === 'pages') {
    const existing = await api('GET', repositoryPath + '/pages', undefined, true);
    if (existing) { console.log(JSON.stringify({ pages: existing.html_url, buildType: existing.build_type, reused: true })); return; }
    const result = await api('POST', repositoryPath + '/pages', { build_type: 'workflow' });
    console.log(JSON.stringify({ pages: result.html_url, buildType: result.build_type }));
  } else if (mode === 'status') {
    const runs = await api('GET', repositoryPath + '/actions/runs?per_page=3');
    const pages = await api('GET', repositoryPath + '/pages', undefined, true);
    const issues = await api('GET', `/repos/${contest}/issues?creator=${owner}&state=all&per_page=100`);
    const issue = issues.find((item) => !item.pull_request && item.body?.includes(repositoryUrl));
    const comments = issue ? await api('GET', `/repos/${contest}/issues/${issue.number}/comments`) : [];
    console.log(JSON.stringify({ repository: repositoryUrl, pages: pages?.html_url ?? null,
      workflowRuns: runs.workflow_runs.map((run) => ({ id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url, sha: run.head_sha })),
      issue: issue ? { url: issue.html_url, number: issue.number, state: issue.state } : null,
      comments: comments.map((comment) => ({ author: comment.user.login, body: comment.body, url: comment.html_url })),
    }, null, 2));
  } else if (mode === 'audit') {
    const issue = await api('GET', `/repos/${contest}/issues/755`);
    const recent = await api('GET', `/repos/${contest}/issues?state=all&per_page=8`);
    const examples = await Promise.all(recent.filter((item) => item.number < 755 && !item.pull_request).slice(0, 3).map(async (item) => {
      const comments = await api('GET', `/repos/${contest}/issues/${item.number}/comments`);
      return { number: item.number, createdAt: item.created_at,
        officialReplies: comments.filter((comment) => comment.author_association === 'COLLABORATOR' || /M-China/.test(comment.user.login))
          .map((comment) => ({ at: comment.created_at, author: comment.user.login, body: comment.body })) };
    }));
    console.log(JSON.stringify({ submittedIssue: { number: issue.number, createdAt: issue.created_at, labels: issue.labels.map((label) => label.name), comments: issue.comments }, recentReviewExamples: examples }, null, 2));
  } else if (mode === 'register') {
    const repository = await api('GET', repositoryPath);
    if (repository.private) throw new Error('Competition repository must be public.');
    for (const file of ['README.md', 'CONTEST_DECLARATION.md', 'MCP_INTEGRATION.md', 'mcp-config.example.json', 'SKILL.md']) {
      const content = await api('GET', repositoryPath + `/contents/${file}`);
      if (!content.size) throw new Error(`Missing or empty required file: ${file}`);
    }
    const issues = await api('GET', `/repos/${contest}/issues?creator=${owner}&state=all&per_page=100`);
    const existing = issues.find((item) => !item.pull_request && item.body?.includes(repositoryUrl));
    if (existing) { console.log(JSON.stringify({ issue: existing.html_url, number: existing.number, reused: true })); return; }
    const body = (await readFile('docs/CONTEST_ISSUE.md', 'utf8')).trim();
    if (body.length > 1000 || !body.includes(`项目地址：${repositoryUrl}`)) throw new Error('Issue body failed local format check.');
    const issue = await api('POST', `/repos/${contest}/issues`, {
      title: '【参赛申请】麦麦密桌 SecretTable —— 私人条件留在本地，Agent 协商一桌共识', body,
    });
    console.log(JSON.stringify({ issue: issue.html_url, number: issue.number, submitted: true }));
  } else if (mode === 'homepage') {
    const pages = await api('GET', repositoryPath + '/pages');
    await api('PATCH', repositoryPath, { homepage: pages.html_url });
    await api('PUT', repositoryPath + '/topics', { names: ['ai-agent', 'mcp', 'mcdonalds', 'qwen', 'privacy', 'typescript', 'agent-skill'] });
    console.log(JSON.stringify({ homepage: pages.html_url, topicsUpdated: true }));
  } else throw new Error('Unknown release command.');
}

main().catch((error) => { console.error(error.message.includes(credentials.password) ? 'Release failed.' : error.message); process.exitCode = 1; });
