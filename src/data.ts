export const CATEGORIES = ["荤菜", "素菜", "主食", "汤羹"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Ingredient = { name: string; amount: number; unit: string };
export type Recipe = {
  id: string;
  name: string;
  category: Category;
  minutes: number;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
  favorite: boolean;
  art: string;
};
export type Meal = { recipeId: string; servings: number };
export type State = {
  version: 1;
  recipes: Recipe[];
  plans: Record<string, Meal[]>;
  checked: string[];
};
export const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const SLOTS = ["午餐", "晚餐"];
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function weekDates(offset = 0) {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  return DAYS.map((_, index) => {
    const d = new Date(start);
    d.setDate(d.getDate() + index);
    return d;
  });
}
export function mealKey(date: Date, slot: string) {
  return `${localDate(date)}:${slot}`;
}
export const seedRecipes: Recipe[] = [
  {
    id: "tomato-egg",
    name: "番茄炒蛋",
    category: "素菜",
    minutes: 15,
    servings: 2,
    art: "tomato",
    favorite: true,
    ingredients: [
      { name: "番茄", amount: 2, unit: "个" },
      { name: "鸡蛋", amount: 3, unit: "个" },
      { name: "食用油", amount: 15, unit: "毫升" },
      { name: "盐", amount: 2, unit: "克" },
    ],
    steps: [
      "番茄洗净切块，鸡蛋打散，加少许盐。",
      "热锅放油，倒入蛋液炒至凝固，盛出备用。",
      "下番茄炒软出汁，倒回鸡蛋翻炒均匀，调味后出锅。",
    ],
  },
  {
    id: "broccoli-shrimp",
    name: "西兰花炒虾仁",
    category: "荤菜",
    minutes: 20,
    servings: 2,
    art: "green",
    favorite: false,
    ingredients: [
      { name: "西兰花", amount: 1, unit: "颗" },
      { name: "虾仁", amount: 200, unit: "克" },
      { name: "蒜", amount: 3, unit: "瓣" },
      { name: "食用油", amount: 10, unit: "毫升" },
      { name: "盐", amount: 2, unit: "克" },
    ],
    steps: [
      "西兰花切小朵焯水，虾仁去虾线洗净。",
      "热锅放油，蒜末炒香，加入虾仁炒至变色。",
      "加入西兰花，撒盐翻炒均匀即可。",
    ],
  },
  {
    id: "potato-beef",
    name: "土豆炖牛肉",
    category: "荤菜",
    minutes: 60,
    servings: 3,
    art: "stew",
    favorite: true,
    ingredients: [
      { name: "牛肉", amount: 400, unit: "克" },
      { name: "土豆", amount: 2, unit: "个" },
      { name: "胡萝卜", amount: 1, unit: "根" },
      { name: "生抽", amount: 20, unit: "毫升" },
      { name: "姜", amount: 10, unit: "克" },
    ],
    steps: [
      "牛肉切块，冷水入锅焯去浮沫；土豆和胡萝卜切块。",
      "姜片炒香，下牛肉和生抽翻炒，加热水没过牛肉。",
      "小火炖煮40分钟，加入土豆和胡萝卜再煮15分钟至软烂。",
    ],
  },
  {
    id: "garlic-greens",
    name: "蒜蓉生菜",
    category: "素菜",
    minutes: 10,
    servings: 2,
    art: "leaves",
    favorite: false,
    ingredients: [
      { name: "生菜", amount: 1, unit: "颗" },
      { name: "蒜", amount: 4, unit: "瓣" },
      { name: "生抽", amount: 10, unit: "毫升" },
      { name: "食用油", amount: 10, unit: "毫升" },
    ],
    steps: [
      "生菜掰开洗净，蒜切末。",
      "热锅下油，爆香蒜末，加入生菜大火快炒。",
      "淋入生抽，炒至叶片变软即出锅。",
    ],
  },
  {
    id: "mushroom-soup",
    name: "菌菇豆腐汤",
    category: "汤羹",
    minutes: 25,
    servings: 2,
    art: "soup",
    favorite: false,
    ingredients: [
      { name: "嫩豆腐", amount: 1, unit: "盒" },
      { name: "鲜香菇", amount: 100, unit: "克" },
      { name: "鸡蛋", amount: 1, unit: "个" },
      { name: "盐", amount: 2, unit: "克" },
    ],
    steps: [
      "香菇洗净切片，豆腐切块，鸡蛋打散。",
      "香菇加水煮开，放入豆腐，小火煮8分钟。",
      "缓缓淋入蛋液，煮至凝固，加盐调味。",
    ],
  },
  {
    id: "fried-rice",
    name: "缤纷蛋炒饭",
    category: "主食",
    minutes: 15,
    servings: 2,
    art: "rice",
    favorite: true,
    ingredients: [
      { name: "米饭", amount: 2, unit: "碗" },
      { name: "鸡蛋", amount: 2, unit: "个" },
      { name: "胡萝卜", amount: 1, unit: "根" },
      { name: "玉米粒", amount: 50, unit: "克" },
      { name: "食用油", amount: 15, unit: "毫升" },
      { name: "盐", amount: 2, unit: "克" },
    ],
    steps: [
      "胡萝卜切小丁，鸡蛋打散，米饭拨松。",
      "热锅放油炒散鸡蛋，加入胡萝卜丁和玉米粒翻炒。",
      "倒入米饭炒至粒粒分明，加盐调味。",
    ],
  },
];
export function initialState(): State {
  return { version: 1, recipes: seedRecipes, plans: {}, checked: [] };
}
export function isValidState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const s = value as State;
  if (
    s.version !== 1 ||
    !Array.isArray(s.recipes) ||
    !s.plans ||
    typeof s.plans !== "object" ||
    Array.isArray(s.plans) ||
    !Array.isArray(s.checked) ||
    !s.checked.every((x) => typeof x === "string")
  )
    return false;
  const positive = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n > 0;
  const valid = s.recipes.every(
    (r) =>
      r &&
      typeof r.id === "string" &&
      typeof r.name === "string" &&
      CATEGORIES.includes(r.category) &&
      positive(r.minutes) &&
      positive(r.servings) &&
      typeof r.art === "string" &&
      typeof r.favorite === "boolean" &&
      Array.isArray(r.ingredients) &&
      r.ingredients.every(
        (i) =>
          i &&
          typeof i.name === "string" &&
          positive(i.amount) &&
          typeof i.unit === "string",
      ) &&
      Array.isArray(r.steps) &&
      r.steps.every((x) => typeof x === "string"),
  );
  return (
    valid &&
    new Set(s.recipes.map((r) => r.id)).size === s.recipes.length &&
    Object.values(s.plans).every(
      (items) =>
        Array.isArray(items) &&
        items.every(
          (m) => m && typeof m.recipeId === "string" && positive(m.servings),
        ),
    )
  );
}
export const STORAGE_KEY = "family-kitchen:v1";
export function loadState(): { state: State; warning: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { state: initialState(), warning: "" };
    const value: unknown = JSON.parse(saved);
    if (!isValidState(value)) throw new Error("invalid");
    return { state: value, warning: "" };
  } catch {
    return {
      state: initialState(),
      warning:
        "本地数据暂时无法读取，已显示示例菜谱。你可以导出当前数据备份；浏览器中的旧数据不会被自动覆盖。",
    };
  }
}
export type ShoppingItem = Ingredient & { key: string };
export function shoppingList(state: State, dates: Date[]): ShoppingItem[] {
  const list = new Map<string, ShoppingItem>();
  for (const date of dates)
    for (const slot of SLOTS)
      for (const meal of state.plans[mealKey(date, slot)] ?? []) {
        const recipe = state.recipes.find((r) => r.id === meal.recipeId);
        if (!recipe) continue;
        for (const i of recipe.ingredients) {
          const key = JSON.stringify([i.name.trim(), i.unit.trim()]);
          const amount = (i.amount * meal.servings) / recipe.servings;
          const existing = list.get(key);
          if (existing) existing.amount += amount;
          else list.set(key, { ...i, key, amount });
        }
      }
  return [...list.values()];
}
export function formatAmount(n: number) {
  return n > 0 && n < 0.01 ? "<0.01" : Number(n.toFixed(2)).toString();
}
