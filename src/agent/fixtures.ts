import type { MenuItem, PrivateProfile, Proposal, PublicTraceEvent } from './types';

export const demoMenu: MenuItem[] = [
  { id: 'spicy-burger', name: '麦辣鸡腿堡', price: 22, calories: 530, protein: 23, tags: ['spicy', 'chicken', 'savory'] },
  { id: 'chicken-burger', name: '麦香鸡', price: 14, calories: 420, protein: 17, tags: ['chicken', 'savory'] },
  { id: 'nuggets', name: '麦乐鸡 5块', price: 14, calories: 225, protein: 13, tags: ['chicken', 'savory'] },
  { id: 'fries', name: '中薯条', price: 13, calories: 337, protein: 4, tags: ['vegetable', 'savory'] },
  { id: 'corn', name: '玉米杯', price: 12, calories: 90, protein: 3, tags: ['vegetable', 'fresh'] },
  { id: 'zero-cola', name: '零度可乐', price: 10, calories: 0, protein: 0, tags: ['zero-sugar', 'fresh'] },
  { id: 'sundae', name: '草莓新地', price: 12, calories: 245, protein: 5, tags: ['sweet', 'dessert'] },
  { id: 'cone', name: '圆筒冰淇淋', price: 5, calories: 153, protein: 3, tags: ['sweet', 'dessert'] },
];

export const demoProfiles: PrivateProfile[] = [
  {
    agentId: 'lin',
    displayName: '小林',
    budget: 35,
    preferredTags: ['spicy', 'chicken'],
    blockedTags: ['beef'],
    minProtein: 20,
  },
  {
    agentId: 'zhe',
    displayName: '阿哲',
    budget: 30,
    requiredTags: ['zero-sugar'],
    preferredTags: ['savory', 'fresh'],
    blockedTags: ['sweet'],
    maxCalories: 520,
  },
  {
    agentId: 'momo',
    displayName: 'Momo',
    budget: 28,
    preferredTags: ['vegetable', 'dessert'],
    blockedTags: ['beef', 'spicy'],
    maxCalories: 520,
  },
];

export const demoProposals: Proposal[] = [
  {
    id: 'p1',
    label: '都点招牌',
    assignments: [
      { agentId: 'lin', itemIds: ['spicy-burger', 'fries'] },
      { agentId: 'zhe', itemIds: ['chicken-burger', 'fries'] },
      { agentId: 'momo', itemIds: ['fries', 'sundae'] },
    ],
  },
  {
    id: 'p2',
    label: '均衡共识餐',
    assignments: [
      { agentId: 'lin', itemIds: ['spicy-burger', 'cone'] },
      { agentId: 'zhe', itemIds: ['chicken-burger', 'zero-cola'] },
      { agentId: 'momo', itemIds: ['corn', 'cone'] },
    ],
  },
  {
    id: 'p3',
    label: '甜口优先',
    assignments: [
      { agentId: 'lin', itemIds: ['chicken-burger', 'cone'] },
      { agentId: 'zhe', itemIds: ['chicken-burger', 'sundae'] },
      { agentId: 'momo', itemIds: ['corn', 'sundae'] },
    ],
  },
  {
    id: 'p4',
    label: '低价试探',
    assignments: [
      { agentId: 'lin', itemIds: ['nuggets'] },
      { agentId: 'zhe', itemIds: ['corn', 'zero-cola'] },
      { agentId: 'momo', itemIds: ['fries', 'cone'] },
    ],
  },
];

export const traceEvents: PublicTraceEvent[] = [
  { step: 1, actor: 'MCP', action: 'query-meals', detail: '读取当前门店可售菜单', status: 'done' },
  { step: 2, actor: '协调 Agent', action: 'propose', detail: '生成 4 组匿名候选方案', status: 'done' },
  { step: 3, actor: '3 个私密 Agent', action: 'evaluate', detail: '本地判断，只回传信号', status: 'done' },
  { step: 4, actor: '公平求解器', action: 'max-min', detail: '最大化最低满意度', status: 'done' },
  { step: 5, actor: 'MCP', action: 'calculate-price', detail: '最终方案等待官方核价', status: 'active' },
  { step: 6, actor: '人类', action: 'confirm', detail: '确认后才可创建订单', status: 'waiting' },
];
