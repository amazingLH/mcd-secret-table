import { describe, expect, it } from 'vitest';
import { candidateBadge, explainIdentifiers, mealWithCode, participantName } from '../src/agent/presentation';
import { demoMenu, demoProfiles, demoProposals } from '../src/agent/fixtures';
import { createPrivatePreferenceAgent, rankProposals } from '../src/agent/negotiator';

const menu = [{ ...demoMenu[0], id: '1440', name: '麦辣鸡腿汉堡' }, { ...demoMenu[1], id: '1450', name: '麦香鸡' }];
const people = [{ agentId: 'a1', displayName: '参与者 1' }];
const ranked = rankProposals(demoProposals, demoProfiles.map((p) => createPrivatePreferenceAgent(p, demoMenu)));

describe('面向用户的解释与选中状态', () => {
  it('给真实编号和匿名参与者补名称，并解释 utility', () => {
    expect(explainIdentifiers('a1只接受含1440的组合（utility=100），1450+小食。', menu, people))
      .toBe('a1（参与者 1）只接受含1440（麦辣鸡腿汉堡）的组合（满意度=100），1450（麦香鸡）+小食。');
  });
  it('不篡改数字的子串、小数、模型版本、金额或未知商品', () => {
    expect(explainIdentifiers('11440 14401 1440.50 qwen-1440 1440元 9999', menu)).toBe('11440 14401 1440.50 qwen-1440 1440元 9999');
  });
  it('已补名称的说明不重复标注，原始文本不被修改', () => {
    const raw = '1440（麦辣鸡腿汉堡）和1450(麦香鸡)';
    expect(explainIdentifiers(raw, menu)).toBe(raw);
    const formatted = explainIdentifiers('1440和1450', menu);
    expect(explainIdentifiers(formatted, menu)).toBe(formatted);
    expect(raw).toBe('1440（麦辣鸡腿汉堡）和1450(麦香鸡)');
  });
  it('餐品名称来自传入的本轮菜单，未核实编号不会编造名称', () => {
    expect(mealWithCode('1440', [{ ...menu[0], name: '本轮官方名称' }])).toBe('1440（本轮官方名称）');
    expect(mealWithCode('unknown', menu)).toBe('unknown（未核实餐品）');
    expect(participantName('a1', people)).toBe('参与者 1');
  });
  it('多个全员接受候选也只给最终方案加唯一采用标记', () => {
    const first = { ...ranked[0], acceptedByAll: true };
    const second = { ...ranked[1], acceptedByAll: true };
    expect(candidateBadge(first, second.proposal.id, 'live')).toBe('全员接受 · 未采用');
    expect(candidateBadge(second, second.proposal.id, 'live')).toBe('最终采用');
  });
  it('待核价、核价失败、未达共识与离线选中不会混称最终通过', () => {
    expect(candidateBadge(ranked[0], undefined, 'live')).toBe('全员接受 · 待核价');
    expect(candidateBadge(ranked[0], undefined, 'live', 'checking')).toBe('正在核价');
    expect(candidateBadge(ranked[0], undefined, 'live', 'failed')).toBe('核价或复核未通过');
    expect(candidateBadge({ ...ranked[0], acceptedByAll: false }, undefined, 'live')).toBe('尚未全员接受');
    expect(candidateBadge(ranked[0], ranked[0].proposal.id, 'demo')).toBe('演示选中');
  });
});
