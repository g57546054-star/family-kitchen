import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  BookOpen,
  CalendarDays,
  ShoppingBasket,
  Plus,
  Search,
  Heart,
  Clock3,
  Users,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  Pencil,
  Leaf,
  ChefHat,
  Check,
  Download,
  HardDrive,
  Utensils,
  Menu,
  CheckCircle2,
  Sprout,
} from "lucide-react";
import {
  CATEGORIES,
  DAYS,
  SLOTS,
  STORAGE_KEY,
  loadState,
  weekDates,
  mealKey,
  localDate,
  shoppingList,
  formatAmount,
  type Recipe,
  type State,
  type Ingredient,
} from "./data";
import DishArt from "./DishArt";

type Page = "recipes" | "week" | "shopping";
type Dialog =
  | { type: "detail"; recipe: Recipe }
  | { type: "edit"; recipe?: Recipe }
  | { type: "plan"; recipe?: Recipe; date?: string; slot?: string }
  | { type: "delete"; recipe: Recipe }
  | null;

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current!;
    const selector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
    (
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog.querySelector<HTMLElement>(selector)
    )?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(selector),
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">FAMILY KITCHEN</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function RecipeForm({
  recipe,
  onSave,
  onClose,
}: {
  recipe?: Recipe;
  onSave: (recipe: Recipe) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [category, setCategory] = useState<Recipe["category"]>(
    recipe?.category ?? "荤菜",
  );
  const [minutes, setMinutes] = useState(recipe?.minutes ?? 20);
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients.map((i) => ({ ...i })) ?? [
      { name: "", amount: 1, unit: "克" },
    ],
  );
  const [steps, setSteps] = useState(recipe?.steps.join("\n") ?? "");
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (
      !name.trim() ||
      !steps.trim() ||
      ingredients.some(
        (i) =>
          !i.name.trim() ||
          !i.unit.trim() ||
          !Number.isFinite(i.amount) ||
          i.amount <= 0,
      )
    ) {
      setError("请填写菜名、完整食材和至少一个做法步骤。");
      return;
    }
    onSave({
      id: recipe?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category,
      minutes,
      servings,
      ingredients: ingredients.map((i) => ({
        ...i,
        name: i.name.trim(),
        unit: i.unit.trim(),
      })),
      steps: steps
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      favorite: recipe?.favorite ?? false,
      art:
        recipe?.art ??
        { 荤菜: "stew", 素菜: "leaves", 主食: "rice", 汤羹: "soup" }[category],
    });
  }
  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    setIngredients((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  return (
    <form onSubmit={submit} className="recipe-form">
      <label>
        菜谱名称 <span className="required">*</span>
        <input
          data-autofocus
          required
          maxLength={60}
          placeholder="例如：妈妈的红烧肉"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="form-row">
        <label>
          分类
          <select
            aria-label="分类"
            value={category}
            onChange={(e) => setCategory(e.target.value as Recipe["category"])}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          烹饪时间（分钟）
          <input
            type="number"
            min="1"
            max="1440"
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.valueAsNumber)}
          />
        </label>
        <label>
          份量（人）
          <input
            type="number"
            min="1"
            max="100"
            required
            value={servings}
            onChange={(e) => setServings(e.target.valueAsNumber)}
          />
        </label>
      </div>
      <div className="form-section-title">
        <h3>
          所需食材 <span className="required">*</span>
        </h3>
        <span>数量会按用餐人数换算</span>
      </div>
      <div className="ingredient-labels">
        <span>食材名称</span>
        <span>数量</span>
        <span>单位</span>
        <span />
      </div>
      {ingredients.map((item, index) => (
        <div className="ingredient-row" key={index}>
          <input
            aria-label={`食材${index + 1}名称`}
            required
            maxLength={40}
            placeholder="例如：土豆"
            value={item.name}
            onChange={(e) => updateIngredient(index, { name: e.target.value })}
          />
          <input
            aria-label={`食材${index + 1}数量`}
            required
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            value={item.amount}
            onChange={(e) =>
              updateIngredient(index, { amount: e.target.valueAsNumber })
            }
          />
          <input
            aria-label={`食材${index + 1}单位`}
            required
            maxLength={10}
            list="units"
            value={item.unit}
            onChange={(e) => updateIngredient(index, { unit: e.target.value })}
          />
          <button
            type="button"
            className="icon-button danger"
            aria-label={`移除食材${index + 1}`}
            disabled={ingredients.length === 1}
            onClick={() =>
              setIngredients(ingredients.filter((_, i) => i !== index))
            }
          >
            <Trash2 size={17} />
          </button>
        </div>
      ))}
      <datalist id="units">
        {["克", "千克", "个", "颗", "根", "瓣", "盒", "碗", "毫升", "勺"].map(
          (u) => (
            <option key={u} value={u} />
          ),
        )}
      </datalist>
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setIngredients([...ingredients, { name: "", amount: 1, unit: "克" }])
        }
      >
        <Plus size={16} />
        添加食材
      </button>
      <label className="steps-label">
        做法步骤 <span className="required">*</span>
        <textarea
          required
          rows={4}
          maxLength={10000}
          placeholder={
            "每行一个步骤，例如：\n食材洗净，切块备用\n热锅下油，翻炒至熟"
          }
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
        <small>每行会保存为一个独立步骤。</small>
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <footer className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="button primary">
          <Check size={17} />
          {recipe ? "保存修改" : "保存菜谱"}
        </button>
      </footer>
    </form>
  );
}

function PlannerForm({
  dialog,
  recipes,
  dates,
  onSave,
}: {
  dialog: Extract<Dialog, { type: "plan" }>;
  recipes: Recipe[];
  dates: Date[];
  onSave: (id: string, date: string, slot: string, servings: number) => void;
}) {
  const today = localDate(new Date());
  const [recipeId, setRecipeId] = useState(
    dialog.recipe?.id ?? recipes[0]?.id ?? "",
  );
  const [date, setDate] = useState(
    dialog.date ??
      (dates.some((d) => localDate(d) === today) ? today : localDate(dates[0])),
  );
  const [slot, setSlot] = useState(dialog.slot ?? "晚餐");
  const [servings, setServings] = useState(
    dialog.recipe?.servings ?? recipes[0]?.servings ?? 2,
  );
  return (
    <form
      className="recipe-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(recipeId, date, slot, servings);
      }}
    >
      <label>
        选择菜谱
        <select
          data-autofocus
          value={recipeId}
          required
          onChange={(e) => {
            setRecipeId(e.target.value);
            setServings(
              recipes.find((r) => r.id === e.target.value)?.servings ?? 2,
            );
          }}
        >
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-row two">
        <label>
          哪一天
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d, i) => (
              <option key={localDate(d)} value={localDate(d)}>
                {DAYS[i]} · {d.getMonth() + 1}月{d.getDate()}日
              </option>
            ))}
          </select>
        </label>
        <label>
          哪一餐
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        用餐人数
        <input
          type="number"
          required
          min="1"
          max="100"
          value={servings}
          onChange={(e) => setServings(e.target.valueAsNumber)}
        />
      </label>
      <div className="info-box">
        <ShoppingBasket size={20} />
        <p>安排后，食材会按用餐人数自动加入这一周的购物清单。</p>
      </div>
      <footer className="modal-actions">
        <button className="button primary" type="submit" disabled={!recipeId}>
          <CalendarDays size={17} />
          加入菜单
        </button>
      </footer>
    </form>
  );
}

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [loaded] = useState(loadState);
  const [state, setState] = useState<State>(loaded.state);
  const [warning, setWarning] = useState(loaded.warning);
  const [page, setPage] = useState<Page>("recipes");
  const [favorites, setFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [week, setWeek] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [saved, setSaved] = useState(!loaded.warning);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }
  function update(next: State) {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
      setWarning("");
    } catch {
      setSaved(false);
      setWarning(
        "浏览器未能保存数据（存储空间不足或权限受限）。当前修改仅在本页保留，请及时导出备份。",
      );
    }
  }
  function navigate(next: Page, fav = false) {
    setPage(next);
    setFavorites(fav);
    setMobileNav(false);
  }
  const dates = weekDates(week);
  const weekLabel = `${dates[0].getMonth() + 1}月${dates[0].getDate()}日 — ${dates[6].getMonth() + 1}月${dates[6].getDate()}日`;
  const items = shoppingList(state, dates);
  const checkedKey = (key: string) => `${localDate(dates[0])}:${key}`;
  const checkedCount = items.filter((i) =>
    state.checked.includes(checkedKey(i.key)),
  ).length;
  const plannedCount = dates.reduce(
    (total, d) =>
      total +
      SLOTS.reduce((n, s) => n + (state.plans[mealKey(d, s)]?.length ?? 0), 0),
    0,
  );
  const filterRecipes = state.recipes.filter(
    (r) =>
      (!favorites || r.favorite) &&
      (category === "全部" || r.category === category) &&
      query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .every((q) =>
          [r.name, r.category, ...r.ingredients.map((i) => i.name)]
            .join(" ")
            .toLowerCase()
            .includes(q),
        ),
  );
  const pageTitle =
    page === "recipes"
      ? favorites
        ? "收藏菜谱"
        : "我的菜谱"
      : page === "week"
        ? "每周菜单"
        : "购物清单";
  function addPlan(
    recipeId: string,
    date: string,
    slot: string,
    servings: number,
  ) {
    const key = `${date}:${slot}`;
    const meals = state.plans[key] ?? [];
    const existing = meals.find((m) => m.recipeId === recipeId);
    const next = existing
      ? meals.map((m) =>
          m.recipeId === recipeId
            ? { ...m, servings: m.servings + servings }
            : m,
        )
      : [...meals, { recipeId, servings }];
    update({
      ...state,
      plans: { ...state.plans, [key]: next },
      checked: state.checked.filter(
        (k) => !k.startsWith(`${localDate(dates[0])}:`),
      ),
    });
    setDialog(null);
    notify(
      existing ? "已合并同一道菜的用餐人数" : "已加入菜单，购物清单同步更新",
    );
  }
  function removeMeal(key: string, index: number) {
    update({
      ...state,
      plans: {
        ...state.plans,
        [key]: (state.plans[key] ?? []).filter((_, i) => i !== index),
      },
      checked: state.checked.filter(
        (k) => !k.startsWith(`${localDate(dates[0])}:`),
      ),
    });
    notify("已从菜单移除");
  }
  const toggleFavorite = (recipe: Recipe) =>
    update({
      ...state,
      recipes: state.recipes.map((r) =>
        r.id === recipe.id ? { ...r, favorite: !r.favorite } : r,
      ),
    });
  const weekPicker = (
    <div className="week-picker">
      <button
        className="icon-button"
        aria-label="上一周"
        onClick={() => setWeek(week - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <span>
        {week === 0 ? "本周 · " : ""}
        {weekLabel}
      </span>
      <button
        className="icon-button"
        aria-label="下一周"
        onClick={() => setWeek(week + 1)}
      >
        <ChevronRight size={18} />
      </button>
      {week !== 0 && (
        <button className="text-button" onClick={() => setWeek(0)}>
          回到本周
        </button>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("recipes");
          }}
        >
          <span className="brand-mark">
            <Utensils size={24} />
          </span>
          <span>
            家常<small>FAMILY KITCHEN</small>
          </span>
        </a>
        <div className="sidebar-divider" />
        <span className="nav-label">我的厨房</span>
        <nav aria-label="主导航">
          <button
            className={`nav-item ${page === "recipes" && !favorites ? "active" : ""}`}
            onClick={() => navigate("recipes")}
          >
            <BookOpen size={20} />
            <span>我的菜谱</span>
            <span className="nav-count">{state.recipes.length}</span>
          </button>
          <button
            className={`nav-item ${page === "week" ? "active" : ""}`}
            onClick={() => navigate("week")}
          >
            <CalendarDays size={20} />
            <span>每周菜单</span>
          </button>
          <button
            className={`nav-item ${page === "shopping" ? "active" : ""}`}
            onClick={() => navigate("shopping")}
          >
            <ShoppingBasket size={20} />
            <span>购物清单</span>
            {items.length > 0 && (
              <span className="nav-count">{items.length - checkedCount}</span>
            )}
          </button>
          <div className="sidebar-divider small" />
          <button
            className={`nav-item ${page === "recipes" && favorites ? "active" : ""}`}
            onClick={() => navigate("recipes", true)}
          >
            <Heart size={20} />
            <span>收藏菜谱</span>
            <span className="nav-count">
              {state.recipes.filter((r) => r.favorite).length}
            </span>
          </button>
        </nav>
        <div className="sidebar-note">
          <Sprout size={29} strokeWidth={1.3} />
          <p>
            好好吃饭，
            <br />
            就是生活的小确幸。
          </p>
          <span>一点烟火气，一份家常味</span>
        </div>
        <div className="sidebar-bottom">
          <div>
            <span className={`status-dot ${saved ? "" : "unsaved"}`} />
            <span>{saved ? "数据保存在本机" : "数据尚未保存"}</span>
            <HardDrive size={14} />
          </div>
          <button
            onClick={() => {
              download(
                `家常厨房备份-${localDate(new Date())}.json`,
                JSON.stringify(state, null, 2),
                "application/json",
              );
              notify("已导出数据备份");
            }}
          >
            <Download size={14} />
            导出备份
          </button>
          <small>无需登录 · 你的私房厨房</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <span>我的厨房</span>
            <ChevronRight size={13} />
            <b>{pageTitle}</b>
          </div>
          <div className="topbar-right">
            <span>
              <span className="status-dot" />
              今天也要好好吃饭
            </span>
            <div className="avatar">
              <ChefHat size={20} />
            </div>
          </div>
        </header>
        <div className="page-content">
          {warning && (
            <div role="alert" className="warning-banner">
              {warning}
            </div>
          )}
          {page === "recipes" && !favorites && (
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span />A LITTLE TASTE OF HOME
                </span>
                <h1>
                  把日子过成
                  <br />
                  喜欢的味道<span>。</span>
                </h1>
                <p>
                  收藏拿手好菜，安排一周美味。
                  <br className="mobile-break" />
                  从今天起，认真对待每一餐。
                </p>
                <button
                  className="button primary"
                  onClick={() => navigate("week")}
                >
                  安排本周菜单
                  <ArrowRight size={17} />
                </button>
              </div>
              <div className="hero-visual">
                <span className="hero-circle" />
                <DishArt kind="green" hero />
                <span className="hero-sticker">
                  <Leaf size={15} />
                  一蔬一饭，皆是美好
                </span>
                <span className="hero-scribble">Made with love</span>
              </div>
            </section>
          )}

          {page === "recipes" && (
            <>
              <section className="section-heading">
                <div>
                  <span className="eyebrow">
                    {favorites ? "SAVED WITH LOVE" : "YOUR RECIPE COLLECTION"}
                  </span>
                  <h1>
                    {favorites ? "收藏菜谱" : "我的菜谱"}
                    <span className="count-badge">
                      {favorites
                        ? state.recipes.filter((r) => r.favorite).length
                        : state.recipes.length}
                    </span>
                  </h1>
                  <p>
                    {favorites
                      ? "把喜欢的味道，留给下一餐。"
                      : "记下熟悉的味道，让每一餐都有灵感。"}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setDialog({ type: "edit" })}
                >
                  <Plus size={18} />
                  添加菜谱
                </button>
              </section>
              <div className="recipe-toolbar">
                <div className="category-tabs" aria-label="菜谱分类">
                  {["全部", ...CATEGORIES].map((c) => (
                    <button
                      key={c}
                      aria-pressed={category === c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c === "全部" ? "全部菜谱" : c}
                    </button>
                  ))}
                </div>
                <div className="search-wrap">
                  <Search size={18} />
                  <input
                    aria-label="搜索菜名或食材"
                    placeholder="搜索菜名、食材…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="清空搜索"
                      className="icon-button"
                      onClick={() => setQuery("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
              {query && (
                <p className="search-hint">
                  找到 {filterRecipes.length} 道菜谱 · 多种食材可用空格分隔
                </p>
              )}
              <div className="recipe-grid">
                {filterRecipes.map((recipe) => (
                  <article className="recipe-card" key={recipe.id}>
                    <div className={`recipe-art art-${recipe.art}`}>
                      <button
                        className="art-open"
                        aria-label={`查看${recipe.name}`}
                        onClick={() => setDialog({ type: "detail", recipe })}
                      >
                        <DishArt kind={recipe.art} />
                      </button>
                      <span className="category-badge">{recipe.category}</span>
                      <button
                        className={`favorite-button ${recipe.favorite ? "is-favorite" : ""}`}
                        aria-label={`${recipe.favorite ? "取消收藏" : "收藏"}${recipe.name}`}
                        aria-pressed={recipe.favorite}
                        onClick={() => toggleFavorite(recipe)}
                      >
                        <Heart
                          size={18}
                          fill={recipe.favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <div className="recipe-card-content">
                      <button
                        className="recipe-title"
                        onClick={() => setDialog({ type: "detail", recipe })}
                      >
                        {recipe.name}
                        <ArrowUpRight size={18} />
                      </button>
                      <p className="recipe-ingredients">
                        {recipe.ingredients
                          .slice(0, 3)
                          .map((i) => i.name)
                          .join(" · ")}
                        {recipe.ingredients.length > 3 ? " …" : ""}
                      </p>
                      <div className="recipe-meta">
                        <span>
                          <Clock3 size={14} />
                          {recipe.minutes} 分钟
                        </span>
                        <span>
                          <Users size={14} />
                          {recipe.servings} 人份
                        </span>
                        <button
                          aria-label={`将${recipe.name}加入菜单`}
                          onClick={() => setDialog({ type: "plan", recipe })}
                        >
                          <Plus size={15} />
                          加入菜单
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!filterRecipes.length && (
                <div className="empty-state">
                  <BookOpen size={36} />
                  <h2>
                    {query || category !== "全部"
                      ? "还没找到这道味道"
                      : favorites
                        ? "还没有收藏的菜谱"
                        : "第一道拿手菜，从这里开始"}
                  </h2>
                  <p>
                    {query || category !== "全部"
                      ? "试试其他食材或分类，也可以添加自己的菜谱。"
                      : favorites
                        ? "点击菜谱上的爱心，把喜欢的味道留下来。"
                        : "记下食材和做法，下次做饭就有了灵感。"}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (query || category !== "全部") {
                        setQuery("");
                        setCategory("全部");
                      } else if (favorites) navigate("recipes");
                      else setDialog({ type: "edit" });
                    }}
                  >
                    {query || category !== "全部"
                      ? "清除筛选"
                      : favorites
                        ? "浏览菜谱"
                        : "添加菜谱"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="page-footnote">
                <Leaf size={15} />
                <span>厨房里的每一次用心，都让家更有温度。</span>
              </div>
            </>
          )}

          {page === "week" && (
            <>
              <section className="section-heading">
                <div>
                  <span className="eyebrow">A WEEK OF GOOD FOOD</span>
                  <h1>每周菜单</h1>
                  <p>提前想好吃什么，把更多时间留给生活。</p>
                </div>
                <button
                  className="button primary"
                  disabled={!state.recipes.length}
                  onClick={() => setDialog({ type: "plan" })}
                >
                  <Plus size={18} />
                  安排一餐
                </button>
              </section>
              <div className="week-toolbar">
                {weekPicker}
                <span className="muted">
                  已安排 <b>{plannedCount}</b> 道菜
                </span>
              </div>
              <div className="week-board">
                {dates.map((date, index) => (
                  <section
                    className={`day-column ${localDate(date) === localDate(new Date()) ? "today" : ""}`}
                    key={localDate(date)}
                  >
                    <header>
                      <span>
                        {DAYS[index]}
                        {localDate(date) === localDate(new Date()) && (
                          <small>今天</small>
                        )}
                      </span>
                      <b>
                        {date.getMonth() + 1}
                        <span>/</span>
                        {date.getDate()}
                      </b>
                    </header>
                    <div className="day-meals">
                      {SLOTS.map((slot) => {
                        const key = mealKey(date, slot);
                        return (
                          <div className="meal-slot" key={slot}>
                            <span className="meal-slot-label">
                              <span
                                className={
                                  slot === "午餐" ? "sun-dot" : "moon-dot"
                                }
                              />
                              {slot}
                            </span>
                            {(state.plans[key] ?? []).map((meal, i) => {
                              const recipe = state.recipes.find(
                                (r) => r.id === meal.recipeId,
                              );
                              return (
                                recipe && (
                                  <div className="planned-meal" key={recipe.id}>
                                    <button
                                      onClick={() =>
                                        setDialog({ type: "detail", recipe })
                                      }
                                    >
                                      {recipe.name}
                                    </button>
                                    <div>
                                      <span>{meal.servings} 人份</span>
                                      <button
                                        aria-label={`移除${DAYS[index]}${slot}${recipe.name}`}
                                        className="icon-button"
                                        onClick={() => removeMeal(key, i)}
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>
                                  </div>
                                )
                              );
                            })}
                            <button
                              className="add-meal"
                              aria-label={`安排${DAYS[index]}${slot}`}
                              disabled={!state.recipes.length}
                              onClick={() =>
                                setDialog({
                                  type: "plan",
                                  date: localDate(date),
                                  slot,
                                })
                              }
                            >
                              <Plus size={16} />
                              <span>添加菜谱</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {!state.recipes.length && (
                <div className="info-box">
                  <BookOpen size={20} />
                  <p>先添加一道菜谱，就可以开始安排菜单了。</p>
                  <button
                    className="text-button"
                    onClick={() => setDialog({ type: "edit" })}
                  >
                    添加菜谱
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="week-summary">
                <span className="summary-icon">
                  <ShoppingBasket size={24} />
                </span>
                <div>
                  <h3>菜单安排好了，采购也轻松一点。</h3>
                  <p>
                    已为这一周汇总 {items.length}{" "}
                    种食材，按用餐人数自动计算用量。
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => navigate("shopping")}
                >
                  查看购物清单
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {page === "shopping" && (
            <>
              <section className="section-heading">
                <div>
                  <span className="eyebrow">FROM MENU TO MARKET</span>
                  <h1>购物清单</h1>
                  <p>照着清单去采购，不多买，也不遗漏。</p>
                </div>
                <button
                  className="button secondary"
                  disabled={!items.length}
                  onClick={() =>
                    download(
                      `购物清单-${localDate(dates[0])}.txt`,
                      `${weekLabel} 购物清单\n\n` +
                        items
                          .map(
                            (i) =>
                              `${state.checked.includes(checkedKey(i.key)) ? "☑" : "☐"} ${i.name}  ${formatAmount(i.amount)} ${i.unit}`,
                          )
                          .join("\n"),
                      "text/plain;charset=utf-8",
                    )
                  }
                >
                  <Download size={17} />
                  导出清单
                </button>
              </section>
              <div className="week-toolbar">
                {weekPicker}
                <button
                  className="text-button"
                  onClick={() => navigate("week")}
                >
                  调整菜单
                  <ArrowUpRight size={16} />
                </button>
              </div>
              {items.length > 0 ? (
                <div className="shopping-layout">
                  <section className="shopping-list">
                    <header>
                      <div>
                        <h2>
                          本周所需食材
                          <span className="count-badge">{items.length}</span>
                        </h2>
                        <p>勾选已备好的食材，出门采购更从容。</p>
                      </div>
                      <button
                        className="text-button"
                        disabled={!checkedCount}
                        onClick={() =>
                          update({
                            ...state,
                            checked: state.checked.filter(
                              (k) =>
                                !items.some((i) => checkedKey(i.key) === k),
                            ),
                          })
                        }
                      >
                        取消勾选
                      </button>
                    </header>
                    <div>
                      {items.map((item) => (
                        <label
                          className={`shopping-row ${state.checked.includes(checkedKey(item.key)) ? "checked" : ""}`}
                          key={item.key}
                        >
                          <input
                            type="checkbox"
                            aria-label={`${item.name}已备齐`}
                            checked={state.checked.includes(
                              checkedKey(item.key),
                            )}
                            onChange={(e) => {
                              const key = checkedKey(item.key);
                              update({
                                ...state,
                                checked: e.target.checked
                                  ? [...state.checked, key]
                                  : state.checked.filter((k) => k !== key),
                              });
                            }}
                          />
                          <span className="custom-check">
                            <Check size={14} />
                          </span>
                          <span className="shopping-item-name">
                            {item.name}
                          </span>
                          <span className="shopping-amount">
                            {formatAmount(item.amount)}{" "}
                            <small>{item.unit}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                  <aside className="shopping-summary">
                    <span className="summary-icon">
                      <ShoppingBasket size={26} />
                    </span>
                    <h2>
                      {checkedCount === items.length
                        ? "食材准备好啦！"
                        : "采购进度"}
                    </h2>
                    <p>来自本周安排的 {plannedCount} 道菜</p>
                    <div className="progress-count">
                      <b>{checkedCount}</b>
                      <span>/ {items.length} 种</span>
                    </div>
                    <div className="progress-track">
                      <div
                        style={{
                          width: `${(checkedCount / items.length) * 100}%`,
                        }}
                      />
                    </div>
                    <p>
                      {checkedCount === items.length
                        ? "万事俱备，今天也要好好吃饭。"
                        : `还有 ${items.length - checkedCount} 种食材待准备`}
                    </p>
                    <div className="summary-tip">
                      <Leaf size={17} />
                      <span>
                        出发前先看看冰箱，
                        <br />
                        也许美味已经准备好了一半。
                      </span>
                    </div>
                    <small>
                      同名、同单位食材自动合并。不同单位分别列出，请按实际包装采购。调整菜单或修改菜谱后，相关清单勾选会重置。
                    </small>
                  </aside>
                </div>
              ) : (
                <div className="empty-state shopping-empty">
                  <ShoppingBasket size={44} />
                  <h2>一周的美味，从菜单开始</h2>
                  <p>
                    这一周还没有安排菜谱。添加菜单后，
                    <br />
                    我们会自动帮你整理需要采购的食材。
                  </p>
                  <button
                    className="button primary"
                    onClick={() => navigate("week")}
                  >
                    去安排菜单
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="site-footer">
          <span>
            家常 <span>·</span> 让每一餐，都有家的味道
          </span>
          <span>
            <HardDrive size={12} />
            数据仅保存在当前浏览器，建议定期导出备份
          </span>
        </footer>
      </main>

      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {dialog && (
        <Modal
          key={dialog.type}
          title={
            dialog.type === "detail"
              ? dialog.recipe.name
              : dialog.type === "edit"
                ? dialog.recipe
                  ? "编辑菜谱"
                  : "添加一道家常味"
                : dialog.type === "delete"
                  ? "删除这道菜谱？"
                  : "安排进一周的美味"
          }
          wide={dialog.type === "edit" || dialog.type === "detail"}
          onClose={() => setDialog(null)}
        >
          {dialog.type === "edit" && (
            <RecipeForm
              recipe={dialog.recipe}
              onClose={() => setDialog(null)}
              onSave={(recipe) => {
                const exists = state.recipes.some((r) => r.id === recipe.id);
                update({
                  ...state,
                  recipes: exists
                    ? state.recipes.map((r) =>
                        r.id === recipe.id ? recipe : r,
                      )
                    : [recipe, ...state.recipes],
                  checked: exists ? [] : state.checked,
                });
                setDialog(null);
                notify(exists ? "菜谱已更新" : "新菜谱已保存");
              }}
            />
          )}
          {dialog.type === "plan" && (
            <PlannerForm
              dialog={dialog}
              recipes={state.recipes}
              dates={dates}
              onSave={addPlan}
            />
          )}
          {dialog.type === "detail" && (
            <div className="recipe-detail">
              <div className={`detail-art art-${dialog.recipe.art}`}>
                <DishArt kind={dialog.recipe.art} />
              </div>
              <div className="detail-metadata">
                <span className="pill">{dialog.recipe.category}</span>
                <span>
                  <Clock3 size={16} />
                  {dialog.recipe.minutes} 分钟
                </span>
                <span>
                  <Users size={16} />
                  {dialog.recipe.servings} 人份
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    toggleFavorite(dialog.recipe);
                    setDialog({
                      ...dialog,
                      recipe: {
                        ...dialog.recipe,
                        favorite: !dialog.recipe.favorite,
                      },
                    });
                  }}
                >
                  <Heart
                    size={17}
                    fill={dialog.recipe.favorite ? "currentColor" : "none"}
                  />
                  {dialog.recipe.favorite ? "已收藏" : "收藏"}
                </button>
              </div>
              <h3>所需食材</h3>
              <div className="detail-ingredients">
                {dialog.recipe.ingredients.map((item, i) => (
                  <div key={i}>
                    <span>{item.name}</span>
                    <b>
                      {formatAmount(item.amount)} {item.unit}
                    </b>
                  </div>
                ))}
              </div>
              <h3>做法步骤</h3>
              <ol className="step-list">
                {dialog.recipe.steps.map((step, i) => (
                  <li key={i}>
                    <span>{i + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              <footer className="modal-actions detail-actions">
                <button
                  className="icon-button danger"
                  aria-label="删除菜谱"
                  onClick={() =>
                    setDialog({ type: "delete", recipe: dialog.recipe })
                  }
                >
                  <Trash2 size={18} />
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    setDialog({ type: "edit", recipe: dialog.recipe })
                  }
                >
                  <Pencil size={16} />
                  编辑
                </button>
                <button
                  className="button primary"
                  onClick={() =>
                    setDialog({ type: "plan", recipe: dialog.recipe })
                  }
                >
                  <Plus size={17} />
                  加入菜单
                </button>
              </footer>
            </div>
          )}
          {dialog.type === "delete" && (
            <div className="delete-dialog">
              <p>
                删除「{dialog.recipe.name}
                」后，它也会从所有每周菜单中移除，购物清单会重新计算。此操作无法撤销。
              </p>
              <footer className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() =>
                    setDialog({ type: "detail", recipe: dialog.recipe })
                  }
                >
                  保留菜谱
                </button>
                <button
                  className="button danger-button"
                  onClick={() => {
                    const id = dialog.recipe.id;
                    update({
                      ...state,
                      recipes: state.recipes.filter((r) => r.id !== id),
                      plans: Object.fromEntries(
                        Object.entries(state.plans).map(([key, meals]) => [
                          key,
                          meals.filter((m) => m.recipeId !== id),
                        ]),
                      ),
                      checked: [],
                    });
                    setDialog(null);
                    notify("菜谱已删除");
                  }}
                >
                  确认删除
                </button>
              </footer>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
