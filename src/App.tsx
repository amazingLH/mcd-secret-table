import { useEffect, useState } from 'react';
import { demoMenu, demoProfiles, demoProposals } from './agent/fixtures';
import { createPrivatePreferenceAgent, rankProposals } from './agent/negotiator';
import { buildLocalOffers } from './agent/localOffers';
import { evaluateOfficialQuote } from './agent/quoteEvaluation';
import { liveRequest } from './agent/transport';
import { candidateBadge, explainIdentifiers, mealWithCode, participantName, type QuoteCheck } from './agent/presentation';
import type { Feedback, LiveTable, LiveTrace, OfficialQuote, ProposalRound } from './agent/liveTypes';
import type { MenuItem, NegotiationResult, PrivateProfile, TasteTag } from './agent/types';

const tagLabels: Record<TasteTag, string> = { spicy: '辣口', sweet: '甜口', savory: '咸香', fresh: '清爽', beef: '牛肉类', chicken: '鸡肉类', vegetable: '蔬菜小食', dessert: '甜品', 'zero-sugar': '无糖饮品' };
const initialProfiles = demoProfiles.map((profile, index) => ({ ...profile,
  agentId: `a${index + 1}`, displayName: `参与者 ${index + 1}`, requiredTags: [],
}));
const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

function total(result: NegotiationResult, menu: MenuItem[]) {
  return result.proposal.assignments.flatMap((a) => a.itemIds)
    .reduce((sum, id) => sum + Math.round((menu.find((item) => item.id === id)?.price ?? 0) * 100), 0) / 100;
}
function feedbackFor(results: NegotiationResult[]): Feedback[] {
  return results.map((result) => ({ proposalId: result.proposal.id,
    signals: result.evaluations.map(({ agentId, accepted, utility }) => ({ agentId, accepted, utility })) }));
}

export default function App() {
  const [mode, setMode] = useState<'live' | 'demo'>('demo');
  const [health, setHealth] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [modelCallBlockReason, setModelCallBlockReason] = useState('');
  const [configuredModel, setConfiguredModel] = useState('');
  const [profiles, setProfiles] = useState<PrivateProfile[]>(initialProfiles);
  const [activeProfile, setActiveProfile] = useState(0);
  const [showPrivate, setShowPrivate] = useState(true);
  const [city, setCity] = useState('上海');
  const [keyword, setKeyword] = useState('人民广场');
  const [budget, setBudget] = useState(90);
  const [table, setTable] = useState<LiveTable | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [rounds, setRounds] = useState<ProposalRound[]>([]);
  const [results, setResults] = useState<NegotiationResult[]>([]);
  const [traces, setTraces] = useState<LiveTrace[]>([]);
  const [quote, setQuote] = useState<OfficialQuote | null>(null);
  const [winner, setWinner] = useState<NegotiationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('填好本地条件，开始协商。');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [quoteChecks, setQuoteChecks] = useState<Record<string, QuoteCheck>>({});

  useEffect(() => {
    if (!isLocalHost) { setHealth('unavailable'); return; }
    fetch('/api/health').then(async (r) => { const h = await r.json(); setHealth(r.ok && h.modelConfigured ? 'ready' : 'unavailable'); setModelCallBlockReason(h.modelCallBlockReason ?? ''); setConfiguredModel(h.model ?? ''); })
      .catch(() => setHealth('unavailable'));
  }, []);
  const emit = (event: LiveTrace) => setTraces((previous) => [...previous, event]);
  const localTrace = (action: string, message: string) => emit({ id: crypto.randomUUID(), actor: 'browser', action, message, at: new Date().toISOString() });
  const profile = profiles[activeProfile];
  function updateProfile(update: Partial<PrivateProfile>) {
    setProfiles((previous) => previous.map((item, index) => index === activeProfile ? { ...item, ...update } : item));
    clearResult();
  }
  function clearResult() { setWinner(null); setQuote(null); setConfirmed(false); setResults([]); setRounds([]); setTable(null); setTraces([]); setMenu([]); setQuoteChecks({}); setStatus('条件已更新，请重新开始协商。'); setError(''); }
  function toggleTag(field: 'preferredTags' | 'blockedTags', tag: TasteTag) {
    updateProfile({ [field]: profile[field].includes(tag) ? profile[field].filter((item) => item !== tag) : [...profile[field], tag] });
  }

  async function run() {
    if (busy) return;
    if (mode === 'live' && health !== 'ready') { setError(modelCallBlockReason || '本地模型服务尚未就绪，请使用离线演示。'); return; }
    clearResult();
    if (profiles.some((p) => !Number.isFinite(p.budget) || p.budget < 1 || (p.maxCalories !== undefined && (!Number.isFinite(p.maxCalories) || p.maxCalories < 1)) || (p.minProtein !== undefined && (!Number.isFinite(p.minProtein) || p.minProtein < 0)))) {
      setError('请检查每个人的预算和营养边界数值。'); return;
    }
    setBusy(true); setShowPrivate(false);
    try {
      if (mode === 'demo') {
        setStatus('离线演示：固定数据，未调用大模型或 MCP。');
        const demo = demoProposals.map((proposal) => ({ ...proposal, assignments: proposal.assignments.map((a, index) => ({ ...a, agentId: profiles[index].agentId })) }));
        setMenu(demoMenu);
        const sorted = rankProposals(demo, profiles.map((p) => createPrivatePreferenceAgent(p, demoMenu)));
        setResults(sorted); setWinner(sorted.find((item) => item.acceptedByAll) ?? null);
        localTrace('fixture-evaluate', '浏览器完成固定候选的本地评估；没有执行实时查询。');
        return;
      }
      setStatus('正在获取营业门店、实时菜单、营养和官方报价…');
      const currentTable = await liveRequest<LiveTable>('/api/tables', { city, keyword,
        participants: profiles.map((p) => p.agentId), publicBudget: budget }, 'table', emit);
      setTable(currentTable); setMenu(currentTable.menu);
      const evaluators = profiles.map((p) => createPrivatePreferenceAgent(p, currentTable.menu));
      let feedback: Feedback[] = [];
      for (let round = 1; round <= 3; round++) {
        setStatus(`协调模型正在${round === 1 ? '提出首轮餐单' : `根据匿名反馈调整第 ${round} 轮餐单`}…`);
        const request = round === 1 ? {} : { feedback, offers: buildLocalOffers(profiles, currentTable.menu) };
        const response = await liveRequest<ProposalRound>(`/api/tables/${currentTable.id}/proposals`, request, 'round', emit);
        setRounds((previous) => [...previous, response]);
        const ranked = rankProposals(response.proposals, evaluators);
        setResults(ranked); feedback = feedbackFor(ranked);
        localTrace('evaluate-locally', `第 ${round} 轮本地评估完成：${ranked.filter((result) => result.acceptedByAll).length} 份候选全员接受。原始个人条件没有发送。`);
        for (const candidate of ranked.filter((result) => result.acceptedByAll)) {
          setStatus('正在对候选餐单重新做官方整单核价…');
          setQuoteChecks((previous) => ({ ...previous, [candidate.proposal.id]: 'checking' }));
          const finalQuote = await liveRequest<OfficialQuote>(`/api/tables/${currentTable.id}/quote`, { proposalId: candidate.proposal.id }, 'quote', emit);
          const verified = evaluateOfficialQuote(candidate.proposal, profiles, currentTable.menu, finalQuote);
          if (verified.acceptedByAll && finalQuote.amountYuan <= budget) {
            setWinner(verified); setQuote(finalQuote);
            setQuoteChecks((previous) => ({ ...previous, [candidate.proposal.id]: 'passed' }));
            localTrace('recheck-private-budgets', '已按最终官方报价在浏览器重新检查个人预算与条件，全员通过。');
            setStatus('共识已形成，官方核价通过。请核对餐单。'); return;
          }
          feedback = feedback.map((item) => item.proposalId === verified.proposal.id ? feedbackFor([verified])[0] : item);
          setQuoteChecks((previous) => ({ ...previous, [candidate.proposal.id]: 'failed' }));
          localTrace('quote-changed', '最终核价未通过本地条件，不能确认这份方案。');
        }
      }
      setStatus('三轮内尚未形成可确认的全员共识。可以调整条件或共同预算后重试。');
    } catch (error) {
      setQuoteChecks((previous) => Object.fromEntries(Object.entries(previous).map(([id, check]) => [id, check === 'checking' ? 'failed' : check])));
      setError(error instanceof Error ? error.message : '实时协商未完成，请重试。');
      setStatus('协商中断，未生成可确认的餐单。');
    } finally { setBusy(false); }
  }

  function downloadSummary() {
    if (!winner || !quote || !table) return;
    const lines = ['# 麦麦密桌共识餐单', '', `采用方案：${explainIdentifiers(winner.proposal.id, [])} · ${winner.proposal.label}`, `门店：${table.store.name}`, `核价时间：${quote.quotedAt}`, '',
      ...winner.proposal.assignments.map((a) => `${participantName(a.agentId, profiles)}（${a.agentId}）：${a.itemIds.map((id) => mealWithCode(id, menu)).join(' + ')}`), '',
      `官方合计：¥${quote.amountYuan.toFixed(2)}`, `最低满意度：${winner.fairness}`, `官方 traceId：${quote.traceId}`, '', '仅包含共识结果，不包含私人预算、偏好或忌口。未创建订单。'];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'secret-table-summary.md'; link.click(); URL.revokeObjectURL(url);
  }

  return <main>
    <header className="nav shell">
      <a className="brand" href="#top"><span className="brand-mark">密</span><span>麦麦密桌 <small>SecretTable</small></span></a>
      <div className="nav-actions"><span className="mode-pill"><i />{mode === 'demo' ? '固定数据演示' : health === 'ready' ? '模型 + 麦当劳 MCP 已就绪' : health === 'checking' ? '检测本地服务…' : '等待本地服务'}</span><a className="ghost-link" href="#workbench">进入密桌 ↓</a></div>
    </header>
    <section id="top" className="hero shell">
      <div className="hero-copy"><span className="eyebrow">PRIVATE PREFERENCES. SHARED DECISION.</span>
        <h1>你说不出口的条件，<br />交给自己的 Agent。</h1>
        <p className="lede">不用在群里解释预算和忌口。你的浏览器负责判断，大模型负责寻找共识，麦当劳 MCP 负责真实菜单与核价。</p>
        <div className="hero-actions"><a className="primary-button hero-cta" href="#workbench">开一桌，试着达成共识 <span>↓</span></a><span className="hero-small">原始个人条件不发送到服务端</span></div>
      </div>
      <div className="hero-visual" aria-label="三个本地评估器与大模型协调器的结构示意">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        <div className="core-agent"><span className="core-kicker">MODEL COORDINATOR</span><strong>共识<br/>协调 Agent</strong><small>接收餐单评估反馈</small></div>
        {profiles.map((p, index) => <div className={`satellite satellite-${index + 1}`} key={p.agentId}><span>{index + 1}</span><strong>{p.displayName}</strong><small>在浏览器评估条件</small></div>)}
      </div>
    </section>
    <section className="status-strip"><div className="shell status-grid">
      <div><strong>0</strong><span>项原始私人条件发送到后端</span></div><div><strong>{profiles.length}</strong><span>个浏览器端偏好评估器</span></div><div><strong>{rounds.length}</strong><span>轮已完成的大模型协商</span></div><div><strong>{menu.length}</strong><span>{mode === 'live' ? '项已核实可选餐品' : '项固定演示餐品'}</span></div>
    </div></section>
    <section id="workbench" className="workspace shell">
      <div className="section-heading"><span className="eyebrow">THE NEGOTIATION TABLE</span><h2>这一餐，照顾到每个人。</h2><p>先设置共同地点，再为每位参与者填写只在本页处理的条件。</p></div>
      {!isLocalHost && <p className="public-preview-note">此在线页面使用固定演示数据，不调用模型或 MCP。真实协商可按 <a href="https://github.com/amazingLH/mcd-secret-table" target="_blank" rel="noreferrer">GitHub 项目说明 ↗</a> 在本机运行。原始条件只保留在本页内存。</p>}
      {isLocalHost && <p className="public-preview-note">{modelCallBlockReason || (health === 'ready' ? `当前模型：${configuredModel}。默认离线演示，不消耗额度。真实协商会调用此模型；免费额度由百炼自动抵扣。请保留百炼的“用完即停”保护；若关闭保护，耗尽后可能计费。` : health === 'checking' ? '默认离线演示，不消耗模型额度。正在检查本地调用配置。' : '本地服务不可用，当前仅可离线演示，不消耗模型额度。')}</p>}
      <fieldset className="table-config panel" disabled={busy}>
        <div className="mode-tabs" role="group" aria-label="运行模式"><button type="button" disabled={!isLocalHost || health !== 'ready'} title={!isLocalHost ? '真实协商请在本机启动服务' : modelCallBlockReason} className={mode === 'live' ? 'selected' : ''} onClick={() => { setMode('live'); clearResult(); }}>真实协商</button><button type="button" className={mode === 'demo' ? 'selected' : ''} onClick={() => { setMode('demo'); clearResult(); }}>离线演示</button></div>
        <label>共同城市<input value={city} onChange={(e) => { setCity(e.target.value); clearResult(); }} maxLength={30}/></label>
        <label>共同用餐地点<input value={keyword} onChange={(e) => { setKeyword(e.target.value); clearResult(); }} maxLength={100}/></label>
        <label>公开总预算 · 元<input type="number" min={20} max={1000} value={budget} onChange={(e) => { setBudget(Number(e.target.value)); clearResult(); }}/></label>
      </fieldset>
      <div className="dashboard-grid">
        <article className="panel vault-panel">
          <div className="panel-head"><div><span className="panel-index">01</span><h3>本地条件舱</h3></div><button className="small-button" disabled={busy} onClick={() => setShowPrivate(!showPrivate)}>{showPrivate ? '隐藏条件' : '编辑条件'}</button></div>
          <fieldset disabled={busy} className="private-form">
            <div className="participant-tabs">{profiles.map((p, index) => <button type="button" key={p.agentId} className={activeProfile === index ? 'selected' : ''} onClick={() => setActiveProfile(index)}>{p.displayName}</button>)}</div>
            {showPrivate ? <>
              <label>我的单餐预算 · 元<input type="number" min={1} max={500} value={profile.budget} onChange={(e) => updateProfile({ budget: Number(e.target.value) })}/></label>
              <label>喜欢的口味<div className="tag-options">{(['spicy','savory','fresh','chicken','vegetable','dessert'] as TasteTag[]).map((tag) => <button type="button" aria-pressed={profile.preferredTags.includes(tag)} key={tag} onClick={() => toggleTag('preferredTags', tag)}>{tagLabels[tag]}</button>)}</div></label>
              <label>不想要的类别<div className="tag-options blocked">{(['spicy','sweet','beef'] as TasteTag[]).map((tag) => <button type="button" aria-pressed={profile.blockedTags.includes(tag)} key={tag} onClick={() => toggleTag('blockedTags', tag)}>{tagLabels[tag]}</button>)}</div></label>
              <div className="nutrition-fields"><label>热量上限 · kcal<input type="number" min={1} value={profile.maxCalories ?? ''} placeholder="不限制" onChange={(e) => updateProfile({ maxCalories: e.target.value ? Number(e.target.value) : undefined })}/></label><label>蛋白质下限 · g<input type="number" min={0} value={profile.minProtein ?? ''} placeholder="不限制" onChange={(e) => updateProfile({ minProtein: e.target.value ? Number(e.target.value) : undefined })}/></label></div>
            </> : <div className="sealed-profiles">{profiles.map((p) => <div key={p.agentId}><span>●</span><strong>{p.displayName}</strong><small>条件留在本页内存</small></div>)}</div>}
          </fieldset>
          <p className="privacy-footnote">本版本为同一浏览器多人演示，不提供设备隔离。类别来自餐品名称，不能用于过敏原判断。</p>
        </article>
        <article className="panel proposals-panel">
          <div className="panel-head"><div><span className="panel-index">02</span><h3>候选方案与本地评估</h3></div><span className="round-badge">{mode === 'live' ? `第 ${rounds.length} 轮` : '固定候选'}</span></div>
          <div className="evaluation-guide"><strong>怎么选：全员接受 → 最低分更高 → 平均分更高</strong><p>数字是浏览器按规则计算的满意度（0–100），不是投票。真实模式按此顺序核价，采用第一个通过官方核价与个人条件复核的方案。</p><details><summary>评分怎么算？</summary><p>先检查个人预算、不想吃的类别、必需类别及营养边界；硬条件不满足记 0 分。通过后按口味命中、预算余量、类别多样性和蛋白质加分，封顶 100；达到 55 分才接受。模型说明不参与评分。</p><p>候选列表展示参考价格下的初筛评分；最终餐单展示官方核价后的复核评分。不保证全菜单全局最优。完全同分时按方案编号稳定排序。</p></details></div>
          {results.length ? <><div className="proposal-list">{results.map((result, index) => <div className={`proposal-card ${winner?.proposal.id === result.proposal.id ? 'selected-proposal' : ''}`} key={result.proposal.id} data-proposal-id={result.proposal.id} data-selected={winner?.proposal.id === result.proposal.id}>
            <div className="proposal-row">
              <div className="proposal-rank">{String(index + 1).padStart(2, '0')}</div><div className="proposal-name"><strong>{result.proposal.label}</strong><span>{explainIdentifiers(result.proposal.id, [])} · 参考 ¥{total(result, menu).toFixed(2)}</span></div>
              <div className="votes" aria-label="各参与者的本地满意度">{result.evaluations.map((e) => <div className="participant-vote" key={e.agentId}><small>{participantName(e.agentId, profiles)}</small><span title={`${e.agentId}：${e.accepted ? '接受' : '拒绝'}`} className={e.accepted ? 'pass' : 'fail'}>{e.utility}</span></div>)}</div>
              <div className="fair-score"><span>最低 / 平均</span><strong>{result.fairness} / {result.averageUtility}</strong></div>
            </div>
            <div className="candidate-status">{candidateBadge(result, winner?.proposal.id, mode, quoteChecks[result.proposal.id])}<small>{result.evaluations.filter((e) => e.accepted).length}/{result.evaluations.length} 人接受</small></div>
            <details className="candidate-details"><summary>查看餐品分配和各人评估</summary>{result.proposal.assignments.map((assignment) => { const evaluation = result.evaluations.find((e) => e.agentId === assignment.agentId); return <div className="candidate-person" key={assignment.agentId}><strong>{participantName(assignment.agentId, profiles)}（{assignment.agentId}）</strong><span>{assignment.itemIds.map((id) => mealWithCode(id, menu)).join(' + ')}</span><small>{evaluation?.accepted ? '本地接受' : '未通过本地条件或最低分要求'} · 满意度 {evaluation?.utility ?? '—'}</small></div>; })}</details>
          </div>)}</div>{rounds.at(-1) && <div className="model-explanation"><strong>协调模型的生成说明</strong><p>{explainIdentifiers(rounds.at(-1)!.explanation, menu, profiles)}</p><small>括号按本轮菜单和参与者编号自动补全。说明可能有误，采用与否以程序校验和核价结果为准。</small></div>}</> : <div className="empty-state"><span>◎</span><strong>共识从一次尝试开始</strong><p>模型提出餐单后，各人的浏览器评估器会独立判断是否接受。</p></div>}
        </article>
        <article className="panel trace-panel"><div className="panel-head"><div><span className="panel-index">03</span><h3>本次真实运行轨迹</h3></div><span className="trace-id">{mode === 'live' ? 'REAL CALLS ONLY' : 'DEMO'}</span></div>
          <div className="live-trace" aria-live="polite">{traces.length ? traces.map((event) => <div className="live-event" key={event.id}><span className={`event-badge ${event.actor}`}>{event.actor === 'model' ? '模型' : event.actor === 'mcp' ? 'MCP' : '本地'}</span><div><strong>{event.action}</strong><p>{event.action === 'submit_table_proposals' ? explainIdentifiers(event.message, menu, profiles) : event.message}</p>{(event.traceId || event.responseId) && <small>{event.traceId ? 'traceId' : 'responseId'}: {event.traceId || event.responseId}</small>}</div></div>) : <p className="trace-empty">尚未执行。运行后的每条记录都来自实际调用或本地评估。</p>}</div>
        </article>
        <article className={`panel result-panel live-result ${winner ? 'revealed' : ''}`}><div className="panel-head"><div><span className="panel-index">04</span><h3>最终餐单</h3></div><span className="consensus-badge">{quote && winner ? '核价后全员通过' : mode === 'demo' ? '仅演示' : '等待共识'}</span></div>
          {winner ? <><div className="selected-summary"><strong>{mode === 'live' ? '最终采用' : '演示选中'}：{winner.proposal.label}</strong><span>方案编号 {explainIdentifiers(winner.proposal.id, [])} · 与上方同编号候选对应</span><p>{winner.evaluations.length}/{winner.evaluations.length} 人通过 · 最低满意度 {winner.fairness} · 平均满意度 {winner.averageUtility}{quote ? ' · 官方核价后已重新复核' : ' · 固定数据，未官方核价'}</p></div><div className="score-ring"><strong>{winner.fairness}</strong><span>最低满意度</span></div><div className="meal-assignments">{winner.proposal.assignments.map((assignment) => <div key={assignment.agentId}><span>{participantName(assignment.agentId, profiles)}</span><strong>{assignment.itemIds.map((id) => menu.find((item) => item.id === id)?.name).join(' + ')}</strong></div>)}</div>
          <div className="result-footer"><div><span>{quote ? '官方最终合计' : '演示数据合计'}</span><strong>¥{(quote?.amountYuan ?? total(winner, menu)).toFixed(2)}</strong></div>{quote && <button onClick={downloadSummary}>下载共识餐单 ↓</button>}</div>
          {quote && <p className="quote-note">{table?.store.name}<br/>核价时间：{quote.quotedAt}<br/>此结果未创建订单。</p>}
          {quote && <button className="confirm-button" onClick={() => setConfirmed(true)} disabled={confirmed}>{confirmed ? '餐单已确认 · 未下单' : '确认这份餐单'}</button>}</> : <div className="empty-state"><span>↻</span><strong>{busy ? '正在寻找共识…' : '不满足条件，就继续协商'}</strong><p>只有各人接受、官方核价通过且本地预算复核通过，才会在这里显示最终餐单。</p></div>}
        </article>
      </div>
      <div className="run-bar"><div role="status"><strong>{status}</strong>{table && <small>{table.store.name} · {table.menu.length} 项已核实餐品 · {table.model}</small>}</div><button className="primary-button" disabled={busy} onClick={run}>{busy ? '真实调用进行中…' : mode === 'live' ? '开始真实协商 →' : '运行离线演示 →'}</button></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <details className="implementation-note"><summary>使用前了解一下</summary><p><strong>个人条件留在本页。</strong>协商只分享评分和少量可接受餐品组合，仍可能间接透露偏好；当前为同一浏览器演示，不提供严格隐私隔离。</p><p><strong>只出餐单，不替你下单。</strong>真实模式使用麦当劳官方菜单与核价，最多协商3轮；无法达成共识时会明确提示。</p><p><strong>离线演示不耗额度。</strong>真实协商消耗所选模型额度，免费抵扣以百炼为准；密钥只供本机服务使用。</p><a href="https://github.com/amazingLH/mcd-secret-table/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">查看完整技术与隐私说明 ↗</a></details>
    </section>
    <footer className="footer shell"><div><strong>麦麦密桌 SecretTable</strong><span>麦当劳程序员创意开发大赛参赛作品 · 非麦当劳官方产品</span></div><span>Private preferences. Shared decisions.</span></footer>
  </main>;
}
