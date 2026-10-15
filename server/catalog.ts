import type { LiveMenuItem } from '../src/agent/liveTypes';
import type { TasteTag } from '../src/agent/types';

export function parseNutrition(data: string) {
  const lines = data.trim().split(/\r?\n/);
  if (!/^\[\d+\]\{/.test(lines[0] ?? '')) throw new Error('INVALID_NUTRITION_FORMAT');
  const values = new Map<string, { calories: number; protein: number }>();
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(',');
    const calories = Number(fields[3]);
    const protein = Number(fields[4]);
    if (fields.length < 5 || !Number.isFinite(calories) || !Number.isFinite(protein)) continue;
    values.set(normalizeName(fields[0]), { calories, protein });
  }
  return values;
}

export const normalizeName = (name: string) => name.replace(/[\s（）()·-]/g, '');

/** Taste labels describe names, not a verified ingredient/allergen inventory. */
export function describeItem(id: string, name: string, priceFen: number, nutrition: ReturnType<typeof parseNutrition>): LiveMenuItem {
  const tags: TasteTag[] = [];
  if (/辣/.test(name)) tags.push('spicy');
  if (/鸡/.test(name)) tags.push('chicken');
  if (/牛堡|牛肉|巨无霸|吉士汉堡|汉堡包/.test(name)) tags.push('beef');
  if (/玉米|薯条|薯饼/.test(name)) tags.push('vegetable');
  if (/冰淇淋|新地|麦旋风|派/.test(name)) tags.push('dessert', 'sweet');
  if (/无糖|零度/.test(name)) tags.push('zero-sugar');
  if (/玉米|可乐|饮用水|纯悦/.test(name)) tags.push('fresh');
  if (/堡|汉堡|麦香鸡|麦香鱼|鸡翅|麦乐鸡|薯条/.test(name)) tags.push('savory');
  const kind = /堡|汉堡|麦香鸡|麦香鱼/.test(name) ? 'main'
    : /可乐|雪碧|茶|咖啡|牛奶|纯悦|豆浆|饮/.test(name) ? 'drink'
    : tags.includes('dessert') ? 'dessert' : 'side';
  const nutrients = nutrition.get(normalizeName(name));
  return { id, name, price: priceFen / 100, calories: nutrients?.calories ?? null,
    protein: nutrients?.protein ?? null, tags, kind, nutritionKnown: Boolean(nutrients) };
}
