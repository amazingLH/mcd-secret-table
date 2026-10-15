import { describe, expect, it } from 'vitest';
import { parseNutrition, describeItem } from '../server/catalog';
import { onlyKeys, validateProposals, validateFeedback } from '../server/validation';
import { createPrivatePreferenceAgent } from '../src/agent/negotiator';
import { evaluateOfficialQuote } from '../src/agent/quoteEvaluation';
import { parseToolArguments } from '../server/model';
import type { LiveTable, OfficialQuote } from '../src/agent/liveTypes';
import type { PrivateProfile, Proposal } from '../src/agent/types';

const nutrition = '[1]{productName,nutritionDescription,energyKj,energyKcal,protein,fat}:\n  麦香鸡,null,1546,369,15,17';
const item = describeItem('1450', '麦香鸡', 1700, parseNutrition(nutrition));
const table: LiveTable = {id:'test-table',store:{code:'test',name:'test'},menu:[item],participants:['a1','a2'],publicBudget:40,createdAt:'',model:'test'};
const proposal: Proposal = {id:'r1-p1',label:'test',assignments:[{agentId:'a1',itemIds:['1450']},{agentId:'a2',itemIds:['1450']}]};
const profiles: PrivateProfile[] = ['a1','a2'].map((agentId)=>({agentId,displayName:'test',budget:20,preferredTags:['chicken'],blockedTags:[],maxCalories:500}));
const quote: OfficialQuote = {proposalId:proposal.id,amountFen:3400,amountYuan:34,quotedAt:'',traceId:'test',items:[{id:'1450',name:'麦香鸡',quantity:2,subtotalFen:3400}]};

describe('真实餐单校验', () => {
  it('仅规范化缺失的根对象结束符，不补造内容或截断字段',()=>{
    expect(parseToolArguments('{"explanation":"test","proposals":[]}')).toEqual({explanation:'test',proposals:[]});
    expect(parseToolArguments('{"explanation":"test","proposals":[]')).toEqual({explanation:'test',proposals:[]});
    expect(()=>parseToolArguments('{"explanation":"test","proposals":[{"label":"cut')).toThrow();
  });
  it('从官方营养记录解析能量和蛋白质，缺失时保留 null',()=>{
    expect(item.calories).toBe(369); expect(item.protein).toBe(15);
    expect(describeItem('unknown','测试餐品',100,parseNutrition(nutrition)).calories).toBeNull();
  });
  it('未知营养不能绕过营养约束，未知商品不能被静默忽略',()=>{
    const evaluator = createPrivatePreferenceAgent(profiles[0],[{...item,calories:null}]);
    expect(evaluator.evaluate(proposal).accepted).toBe(false);
    const invalid = {...proposal,assignments:[{agentId:'a1',itemIds:['1450','invented']}]};
    expect(createPrivatePreferenceAgent(profiles[0],[item]).evaluate(invalid).accepted).toBe(false);
  });
  it('拒绝模型编造商品、遗漏参与者或超共同预算',()=>{
    const valid = {explanation:'test',proposals:[proposal]};
    expect(validateProposals(valid,table,1).proposals[0].id).toBe('r1-p1');
    expect(()=>validateProposals(valid,{...table,publicBudget:30},1)).toThrow();
    expect(()=>validateProposals({explanation:'test',proposals:[{...proposal,assignments:[proposal.assignments[0]]}]},table,1)).toThrow();
    expect(()=>validateProposals({explanation:'test',proposals:[{...proposal,assignments:proposal.assignments.map(a=>({...a,itemIds:['invented']}))}]},table,1)).toThrow();
  });
  it('API 只允许匿名反馈字段，拒绝发送原始预算',()=>{
    expect(()=>onlyKeys({budget:30},['feedback','offers'])).toThrow();
    expect(()=>validateFeedback([{proposalId:proposal.id,signals:[{agentId:'a1',accepted:true,utility:90,budget:20},{agentId:'a2',accepted:true,utility:90}]}],[proposal],table)).toThrow();
  });
  it('官方价格上涨后重新拒绝超出私人预算的方案',()=>{
    expect(evaluateOfficialQuote(proposal,profiles,[item],quote).acceptedByAll).toBe(true);
    expect(evaluateOfficialQuote(proposal,profiles,[item],{...quote,amountFen:5000,items:[{...quote.items[0],subtotalFen:5000}]}).acceptedByAll).toBe(false);
  });
  it('拒绝不对应当前餐单的官方报价和未分摊额外费用',()=>{
    expect(()=>evaluateOfficialQuote(proposal,profiles,[item],{...quote,proposalId:'wrong'})).toThrow();
    expect(()=>evaluateOfficialQuote(proposal,profiles,[item],{...quote,amountFen:3401})).toThrow();
    expect(()=>evaluateOfficialQuote(proposal,profiles,[item],{...quote,items:[{...quote.items[0],quantity:1}]})).toThrow();
  });
});
