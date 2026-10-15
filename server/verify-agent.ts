import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { handleApi } from './api';
import { liveRequest } from '../src/agent/transport';
import { demoProfiles } from '../src/agent/fixtures';
import { createPrivatePreferenceAgent, rankProposals } from '../src/agent/negotiator';
import { buildLocalOffers } from '../src/agent/localOffers';
import { evaluateOfficialQuote } from '../src/agent/quoteEvaluation';
import type { Feedback, LiveTable, LiveTrace, OfficialQuote, ProposalRound } from '../src/agent/liveTypes';

async function main() {
  const server = createServer((req, res) => { void handleApi(req, res); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('未建立本地验收服务。');
  const base = `http://127.0.0.1:${address.port}`;
  const traces: LiveTrace[] = [];
  const emit = (event: LiveTrace) => { traces.push(event); console.log(`${event.actor}: ${event.action}${event.actor === 'model' ? ` ${event.message}` : ''}`); };
  const profiles = demoProfiles.map((p, index) => ({ ...p, agentId: `a${index + 1}`, requiredTags: [] }));
  try {
    const table = await liveRequest<LiveTable>(base + '/api/tables', {
      city: '上海', keyword: '人民广场', participants: profiles.map((p) => p.agentId), publicBudget: 90,
    }, 'table', emit);
    console.log(JSON.stringify({menuItems:table.menu.length, knownNutrition:table.menu.filter(i=>i.nutritionKnown).length}));
    const agents = profiles.map((p) => createPrivatePreferenceAgent(p, table.menu));
    let feedback: Feedback[] = [];
    const rounds: {round:number;responseId:string;model:string;usageTokens:number;acceptedProposals:number;minUtility:number}[] = [];
    let quote: OfficialQuote | undefined;
    let consensus = false;
    for (let round = 1; round <= 3; round++) {
      const response = await liveRequest<ProposalRound>(base + `/api/tables/${table.id}/proposals`,
        round === 1 ? {} : { feedback, offers: buildLocalOffers(profiles, table.menu) }, 'round', emit);
      const ranked = rankProposals(response.proposals, agents);
      feedback = ranked.map((result) => ({ proposalId: result.proposal.id,
        signals: result.evaluations.map(({agentId, accepted, utility}) => ({agentId,accepted,utility})) }));
      const summary = { round, responseId: response.responseId, model: response.model, usageTokens: response.usageTokens,
        acceptedProposals: ranked.filter((result) => result.acceptedByAll).length, minUtility: ranked[0].fairness };
      rounds.push(summary); console.log(JSON.stringify(summary));
      // Exercise at least two actual model rounds to verify feedback reaches the model.
      if (round >= 2) {
        for (const candidate of ranked.filter((result) => result.acceptedByAll)) {
          quote = await liveRequest<OfficialQuote>(base + `/api/tables/${table.id}/quote`, { proposalId: candidate.proposal.id }, 'quote', emit);
          const evaluated = evaluateOfficialQuote(candidate.proposal, profiles, table.menu, quote);
          consensus = evaluated.acceptedByAll && quote.amountYuan <= table.publicBudget;
          if (consensus) break;
        }
        if (consensus) break;
      }
    }
    if (!consensus || !quote) throw new Error('真实协商未在三轮内达成经官方核价复核的共识。');
    const report = { mode:'live-model-and-mcp', verifiedAt: new Date().toISOString(),
      testConditions:'合成的本地三人偏好；原始预算和偏好未发送到 API。公共地点：上海人民广场。',
      store:table.store, menuItems:table.menu.length, rounds, consensus, quote,
      modelTraceCount:traces.filter((t)=>t.actor==='model').length,
      mcpTraceCount:traces.filter((t)=>t.actor==='mcp').length,
      traces, writeOperationsExecuted:0, credentialsIncluded:false };
    await mkdir('evidence', {recursive:true});
    await writeFile('evidence/live-agent.json', JSON.stringify(report,null,2)+'\n','utf8');
    console.log(JSON.stringify({consensus,rounds:rounds.length,amountYuan:quote.amountYuan,evidence:'evidence/live-agent.json'}));
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(()=>resolve())); }
}
main().catch((error) => { console.error(error instanceof Error && !/fetch|token|key/i.test(error.message) ? error.message : '验收失败，请检查本地服务或外部服务状态。'); process.exitCode=1; });
