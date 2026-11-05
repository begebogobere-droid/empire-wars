// src/db/schema.ts
var SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    empire_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_tick INTEGER NOT NULL,
    banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT,
    protected_until INTEGER NOT NULL DEFAULT 0,
    last_attack_at INTEGER NOT NULL DEFAULT 0,
    lock_until INTEGER NOT NULL DEFAULT 0,
    last_daily INTEGER NOT NULL DEFAULT 0,
    state TEXT,
    notify INTEGER NOT NULL DEFAULT 1,
    power INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_players_power ON players(power)`,
  `CREATE TABLE IF NOT EXISTS resources (
    player_id INTEGER PRIMARY KEY,
    gold REAL NOT NULL DEFAULT 0 CHECK (gold >= 0),
    oil REAL NOT NULL DEFAULT 0 CHECK (oil >= 0),
    iron REAL NOT NULL DEFAULT 0 CHECK (iron >= 0),
    steel REAL NOT NULL DEFAULT 0 CHECK (steel >= 0),
    energy REAL NOT NULL DEFAULT 0 CHECK (energy >= 0),
    tech REAL NOT NULL DEFAULT 0 CHECK (tech >= 0)
  )`,
  `CREATE TABLE IF NOT EXISTS buildings (
    player_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),
    PRIMARY KEY (player_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS units (
    player_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    PRIMARY KEY (player_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS techs (
    player_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),
    PRIMARY KEY (player_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    to_level INTEGER NOT NULL,
    finish_at INTEGER NOT NULL,
    UNIQUE (player_id, kind)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_queue_finish ON queue(finish_at)`,
  `CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    attacker_id INTEGER NOT NULL,
    defender_id INTEGER NOT NULL,
    attacker_name TEXT NOT NULL,
    defender_name TEXT NOT NULL,
    winner INTEGER NOT NULL,
    atk_power REAL NOT NULL,
    def_power REAL NOT NULL,
    loot TEXT NOT NULL,
    a_loss TEXT NOT NULL,
    d_loss TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_battles_att ON battles(attacker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_battles_def ON battles(defender_id)`,
  `CREATE TABLE IF NOT EXISTS action_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    message TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value REAL NOT NULL
  )`
];

// src/errors.ts
async function logError(env, e) {
  const msg = e instanceof Error ? `${e.message}
${(e.stack || "").split(`
`).slice(1, 4).join(`
`)}` : String(e);
  console.error("ERR", msg);
  try {
    await env.DB.prepare("INSERT INTO error_log (at, message) VALUES (?, ?)").bind(Math.floor(Date.now() / 1000), msg.slice(0, 900)).run();
  } catch {}
}

// src/data/buildings.ts
var COST_GROWTH = 1.45;
var TIME_GROWTH = 1.5;
var BUILDINGS = [
  { key: "central", name: "ساختمان مرکزی", emoji: "\uD83C\uDFDB", desc: "قلب امپراتوری؛ مالیات طلا می‌دهد و سقف سطح همه ساختمان‌ها را تعیین می‌کند.", minCentral: 1, maxLevel: 10, cost: { gold: 800, iron: 250, steel: 50 }, time: 90 },
  { key: "mine", name: "معدن آهن", emoji: "⛏", desc: "آهن تولید می‌کند.", minCentral: 1, maxLevel: 10, cost: { gold: 300, iron: 100 }, time: 45 },
  { key: "refinery", name: "پالایشگاه", emoji: "\uD83D\uDEE2", desc: "نفت تولید می‌کند.", minCentral: 1, maxLevel: 10, cost: { gold: 400, iron: 150 }, time: 60 },
  { key: "power", name: "نیروگاه", emoji: "⚡", desc: "انرژی تولید می‌کند؛ نگهداری ارتش از انرژی کم می‌شود.", minCentral: 1, maxLevel: 10, cost: { gold: 350, iron: 120 }, time: 50 },
  { key: "warehouse", name: "انبار", emoji: "\uD83D\uDCE6", desc: "ظرفیت ذخیره منابع را بالا می‌برد.", minCentral: 1, maxLevel: 10, cost: { gold: 300, iron: 150 }, time: 45 },
  { key: "steelfactory", name: "کارخانه فولاد", emoji: "\uD83C\uDFED", desc: "آهن را به فولاد تبدیل می‌کند (هر 1 فولاد = 2 آهن).", minCentral: 2, maxLevel: 10, cost: { gold: 700, iron: 300 }, time: 80 },
  { key: "research", name: "مرکز تحقیقات", emoji: "\uD83D\uDD2C", desc: "فناوری تولید می‌کند و تحقیقات جدید را باز می‌کند.", minCentral: 2, maxLevel: 10, cost: { gold: 800, iron: 300, steel: 100 }, time: 90 },
  { key: "barracks", name: "پادگان", emoji: "\uD83E\uDE96", desc: "نگهداری نیروهای زمینی و واحدهای پشتیبانی.", minCentral: 1, maxLevel: 10, cost: { gold: 500, iron: 200 }, time: 60 },
  { key: "airfield", name: "فرودگاه", emoji: "✈️", desc: "خرید و نگهداری جنگنده‌ها.", minCentral: 2, maxLevel: 10, cost: { gold: 1200, iron: 400, steel: 200 }, time: 100 },
  { key: "tankfactory", name: "کارخانه تانک‌سازی", emoji: "\uD83D\uDE9C", desc: "تولید و نگهداری تانک‌ها.", minCentral: 3, maxLevel: 10, cost: { gold: 1100, iron: 400, steel: 250 }, time: 100 },
  { key: "defense", name: "مرکز پدافند", emoji: "\uD83D\uDEE1", desc: "خرید و نگهداری سامانه‌های دفاعی.", minCentral: 3, maxLevel: 10, cost: { gold: 1000, iron: 350, steel: 200 }, time: 100 }
];
var B = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));
var START_BUILDINGS = { central: 1, mine: 1, refinery: 1, power: 1, warehouse: 1 };
function bCost(def, toLevel, cfg) {
  const f = Math.pow(COST_GROWTH, toLevel - 1) * cfg.build_cost_mult;
  const out = {};
  for (const [k, v] of Object.entries(def.cost))
    out[k] = Math.max(1, Math.round(v * f));
  return out;
}
function bTime(def, toLevel, cfg) {
  return Math.max(10, Math.round(def.time * Math.pow(TIME_GROWTH, toLevel - 1) * cfg.build_time_mult));
}
var CAP_PER_LEVEL = { airfield: 10, barracks: 40, tankfactory: 8, defense: 10 };

// src/data/techs.ts
var TECHS = [
  { key: "aero", name: "فناوری هوانوردی", emoji: "\uD83D\uDEE9", desc: "نسل‌های جدید جنگنده را باز می‌کند و قدرت جنگنده‌ها را 4% در هر سطح بالا می‌برد.", max: 5 },
  { key: "armor", name: "فناوری زرهی", emoji: "\uD83E\uDE96", desc: "نسل‌های جدید تانک و پیاده‌نظام پیشرفته را باز می‌کند؛ قدرت نیروی زمینی +4% در هر سطح.", max: 5 },
  { key: "airdef", name: "فناوری پدافند", emoji: "\uD83D\uDCE1", desc: "نسل‌های جدید سامانه‌های دفاعی را باز می‌کند؛ قدرت پدافند +4% در هر سطح.", max: 5 },
  { key: "industry", name: "فناوری صنعتی", emoji: "\uD83C\uDFED", desc: "تولید همه منابع را 5% در هر سطح افزایش می‌دهد.", max: 5 },
  { key: "logistics", name: "فناوری لجستیک", emoji: "\uD83D\uDE9A", desc: "واحدهای پشتیبانی را باز می‌کند و ظرفیت انبار را 10% در هر سطح بالا می‌برد.", max: 5 }
];
var T = Object.fromEntries(TECHS.map((t) => [t.key, t]));
function tCost(toLevel, cfg) {
  const m = cfg.build_cost_mult;
  return { tech: Math.max(1, Math.round(20 * Math.pow(2.2, toLevel - 1) * m)), gold: Math.max(1, Math.round(400 * Math.pow(2, toLevel - 1) * m)) };
}
function tTime(toLevel, cfg) {
  return Math.max(10, Math.round(180 * Math.pow(2.2, toLevel - 1) * cfg.build_time_mult));
}
function tLabReq(toLevel) {
  return toLevel;
}

// src/config.ts
var DEFAULT_CFG = {
  prod_mult: 1,
  build_time_mult: 1,
  build_cost_mult: 1,
  price_mult: 1,
  loot_pct: 0.15,
  protect_hours: 24,
  attack_cooldown: 600,
  shield_seconds: 1800,
  attack_energy: 40,
  daily_gold: 500,
  daily_cooldown_hours: 20,
  min_target_ratio: 0.25
};
var CFG_META = {
  prod_mult: { name: "ضریب تولید منابع", min: 0.1, max: 20 },
  build_time_mult: { name: "ضریب زمان ساخت / ارتقا / تحقیق", min: 0.01, max: 20 },
  build_cost_mult: { name: "ضریب هزینه ساختمان و تحقیق", min: 0.1, max: 20 },
  price_mult: { name: "ضریب قیمت تجهیزات نظامی", min: 0.1, max: 20 },
  loot_pct: { name: "درصد غنیمت نبرد (0.01 تا 0.5)", min: 0.01, max: 0.5 },
  protect_hours: { name: "ساعت محافظت تازه‌واردها", min: 0, max: 168 },
  attack_cooldown: { name: "فاصله بین حمله‌ها (ثانیه)", min: 0, max: 86400 },
  shield_seconds: { name: "سپر بعد از غارت (ثانیه)", min: 0, max: 86400 },
  attack_energy: { name: "انرژی لازم برای حمله", min: 0, max: 1e5 },
  daily_gold: { name: "پاداش روزانه (طلا)", min: 0, max: 1e6 },
  daily_cooldown_hours: { name: "فاصله پاداش روزانه (ساعت)", min: 1, max: 168 },
  min_target_ratio: { name: "حداقل نسبت قدرت هدف به مهاجم", min: 0, max: 1 }
};
var cache = null;
async function getCfg(db, nowMs) {
  if (cache && nowMs - cache.at < 30000)
    return { ...cache.cfg };
  const cfg = { ...DEFAULT_CFG };
  try {
    const r = await db.prepare("SELECT key, value FROM settings").all();
    for (const row of r.results) {
      if (row.key in DEFAULT_CFG && typeof row.value === "number")
        cfg[row.key] = row.value;
    }
  } catch {}
  cache = { at: nowMs, cfg };
  return { ...cfg };
}
function invalidateCfg() {
  cache = null;
}

// src/data/resources.ts
var RES = {
  gold: { name: "طلا", emoji: "\uD83D\uDCB0", use: "خرید تجهیزات و ارتقای ساختمان‌ها" },
  oil: { name: "نفت", emoji: "\uD83D\uDEE2", use: "سوخت و خرید تجهیزات نظامی" },
  iron: { name: "آهن", emoji: "⛓", use: "ساخت‌وساز و ماده اولیه فولاد" },
  steel: { name: "فولاد", emoji: "\uD83D\uDD29", use: "تجهیزات سنگین و ساختمان‌های پیشرفته" },
  energy: { name: "انرژی", emoji: "⚡", use: "نگهداری ارتش و هزینه حمله" },
  tech: { name: "فناوری", emoji: "\uD83D\uDD2C", use: "تحقیقات و بازکردن نسل‌های جدید" }
};
var START_RES = {
  gold: 1500,
  oil: 300,
  iron: 500,
  steel: 100,
  energy: 300,
  tech: 0
};

// src/data/units.ts
var BRANCHES = {
  air: { name: "نیروی هوایی", emoji: "✈️", buildings: ["airfield"], viewLabel: "\uD83D\uDEE9 مشاهده جنگنده‌ها" },
  gnd: { name: "نیروی زمینی", emoji: "\uD83E\uDE96", buildings: ["barracks", "tankfactory"], viewLabel: "\uD83E\uDE96 مشاهده نیروها" },
  def: { name: "نیروی دفاعی", emoji: "\uD83D\uDEE1", buildings: ["defense"], viewLabel: "\uD83D\uDEE1 مشاهده سامانه‌ها" },
  sup: { name: "نیروی پشتیبانی", emoji: "\uD83D\uDE9A", buildings: ["barracks"], viewLabel: "\uD83D\uDE9A مشاهده واحدها" }
};
var CAP_BUILDING = { air: "airfield", inf: "barracks", tank: "tankfactory", def: "defense", sup: "barracks" };
function fromRows(rows, branch, group, emoji, building, techKey, also) {
  return rows.map(([key, name, gen, gold, steel, oil, atk, def, slots, upkeep, bLevel, techLevel]) => ({
    key,
    name,
    emoji,
    branch,
    group,
    gen,
    cost: { gold, steel, oil },
    atk,
    def,
    slots,
    upkeep,
    building,
    bLevel,
    also,
    tech: techLevel > 0 ? { key: techKey, level: techLevel } : undefined,
    capBuilding: CAP_BUILDING[group]
  }));
}
var air = [
  ["f1", "JAS 39 Gripen", 1, 300, 40, 60, 12, 6, 1, 1, 1, 0],
  ["f2", "F-16 Fighting Falcon", 2, 700, 100, 140, 30, 14, 2, 2, 2, 1],
  ["f3", "F-15 Eagle", 3, 1600, 240, 320, 70, 32, 3, 4, 4, 2],
  ["f4", "F-35 Lightning II", 4, 3600, 560, 720, 160, 72, 4, 7, 6, 3],
  ["f5", "F-22 Raptor", 5, 8000, 1300, 1600, 360, 160, 5, 12, 8, 4]
];
var tank = [
  ["t1", "T-90", 1, 200, 50, 30, 8, 10, 1, 1, 1, 0],
  ["t2", "Challenger 2", 2, 460, 120, 70, 20, 25, 2, 2, 2, 1],
  ["t3", "Leopard 2", 3, 1050, 290, 160, 46, 57, 3, 4, 4, 2],
  ["t4", "M1 Abrams", 4, 2400, 700, 370, 105, 130, 4, 7, 6, 3],
  ["t5", "K2 Black Panther", 5, 5500, 1700, 850, 240, 300, 5, 12, 8, 4]
];
var def = [
  ["d1", "Iron Dome", 1, 250, 60, 20, 0, 14, 1, 0.5, 1, 0],
  ["d2", "IRIS-T SLM", 2, 580, 150, 45, 0, 35, 2, 1, 2, 1],
  ["d3", "MIM-104 Patriot", 3, 1330, 360, 105, 0, 80, 3, 2, 4, 2],
  ["d4", "S-400", 4, 3000, 860, 240, 0, 185, 4, 3.5, 6, 3],
  ["d5", "THAAD", 5, 6900, 2000, 560, 0, 420, 5, 6, 8, 4]
];
var inf = [
  { key: "i1", name: "پیاده‌نظام", emoji: "\uD83E\uDE96", branch: "gnd", group: "inf", gen: 1, cost: { gold: 60, iron: 25 }, atk: 3, def: 3, slots: 1, upkeep: 0.3, building: "barracks", bLevel: 1, capBuilding: "barracks" },
  { key: "i2", name: "تفنگداران دریایی", emoji: "\uD83E\uDE96", branch: "gnd", group: "inf", gen: 2, cost: { gold: 220, steel: 25, oil: 10 }, atk: 11, def: 9, slots: 1, upkeep: 0.8, building: "barracks", bLevel: 3, tech: { key: "armor", level: 1 }, capBuilding: "barracks" },
  { key: "i3", name: "چتربازان", emoji: "\uD83E\uDE96", branch: "gnd", group: "inf", gen: 3, cost: { gold: 650, steel: 90, oil: 40 }, atk: 32, def: 26, slots: 2, upkeep: 2, building: "barracks", bLevel: 5, tech: { key: "armor", level: 2 }, capBuilding: "barracks" }
];
var sup = [
  { key: "s1", name: "نیروهای پشتیبانی", emoji: "\uD83D\uDE9A", branch: "sup", group: "sup", gen: 1, cost: { gold: 150, iron: 40, oil: 20 }, atk: 0, def: 0, slots: 1, upkeep: 0.5, building: "barracks", bLevel: 2, capBuilding: "barracks" },
  { key: "s2", name: "نیروهای مهندسی رزمی", emoji: "\uD83D\uDD27", branch: "sup", group: "sup", gen: 2, cost: { gold: 320, steel: 60, oil: 20 }, atk: 0, def: 0, slots: 2, upkeep: 1, building: "barracks", bLevel: 3, tech: { key: "logistics", level: 1 }, capBuilding: "barracks" },
  { key: "s3", name: "نیروهای شناسایی", emoji: "\uD83D\uDCE1", branch: "sup", group: "sup", gen: 3, cost: { gold: 900, steel: 160, oil: 60 }, atk: 0, def: 0, slots: 3, upkeep: 2, building: "barracks", bLevel: 5, tech: { key: "logistics", level: 2 }, capBuilding: "barracks" }
];
var SUPPORT_INFO = {
  s1: "+0.4% قدرت حمله به ازای هر واحد (سقف 20%)",
  s2: "−0.5% تلفات به ازای هر واحد (سقف 30%)",
  s3: "+0.6% قدرت دفاع به ازای هر واحد (سقف 25%)"
};
var UNITS = [
  ...fromRows(air, "air", "air", "✈️", "airfield", "aero"),
  ...inf,
  ...fromRows(tank, "gnd", "tank", "\uD83D\uDE9C", "tankfactory", "armor", { building: "barracks", level: 1 }),
  ...fromRows(def, "def", "def", "\uD83D\uDEE1", "defense", "airdef"),
  ...sup
];
var U = Object.fromEntries(UNITS.map((u) => [u.key, u]));
function unitsOfBranch(br) {
  return UNITS.filter((u) => u.branch === br);
}
var GROUP_TECH = { air: "aero", inf: "armor", tank: "armor", def: "airdef" };

// src/telegram/keyboards.ts
var btn = (text, data, style = "primary") => ({ text, callback_data: data, style });
var homeRow = () => [btn("🏠 منوی اصلی", "h")];
var navRow = (to) => [btn("↩️ بازگشت", to), btn("🏠 منو", "h")];
var backRow = (to, label = "↩️ بازگشت") => [btn(label, to)];
function chunk(items, n = 2) {
  const out = [];
  for (let i = 0;i < items.length; i += n)
    out.push(items.slice(i, i + n));
  return out;
}
function mainMenu(isAdmin) {
  const rows = [
    [btn("🏰 امپراتوری", "g:emp"), btn("⚔️ ارتش", "ar")],
    [btn("🧪 تحقیقات", "rs"), btn("🌍 جهان", "g:wd")],
    [btn("⚙️ تنظیمات", "st"), btn("📖 راهنما", "hp")]
  ];
  if (isAdmin)
    rows.push([btn("🛠 پنل ادمین", "ad")]);
  return rows;
}

// src/types.ts
var RES_KEYS = ["gold", "oil", "iron", "steel", "energy", "tech"];

// src/util.ts
var LINE = "━━━━━━━━━━━━━━";
var H = (t) => `╭─ ✦ ${t} ✦ ─╮`;
var BOLD_DIGITS = ["𝟎", "𝟏", "𝟐", "𝟑", "𝟒", "𝟓", "𝟔", "𝟕", "𝟖", "𝟗"];
var boldDigits = (s) => typeof s === "string" ? s.replace(/\d/g, (d) => BOLD_DIGITS[+d]) : s;
var fa = (v) => String(v);
var num = (v) => {
  const n = Math.floor(v);
  return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
var pct = (v, digits = 0) => v.toFixed(digits) + "%";
function dur(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor(sec % 86400 / 3600);
  const m = Math.floor(sec % 3600 / 60);
  const s = sec % 60;
  const parts = [];
  if (d)
    parts.push(`${fa(d)} روز`);
  if (h)
    parts.push(`${fa(h)} ساعت`);
  if (m)
    parts.push(`${fa(m)} دقیقه`);
  if (!d && !h && (s || !m))
    parts.push(`${fa(s)} ثانیه`);
  return parts.slice(0, 2).join(" و ");
}
function bar(cur, max, len = 10) {
  const f = max > 0 ? Math.max(0, Math.min(len, Math.round(cur / max * len))) : 0;
  return "█".repeat(f) + "░".repeat(len - f);
}
function dateFa(ts) {
  const d = new Date(ts * 1000);
  try {
    return fa(new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran", numberingSystem: "latn" }).format(d));
  } catch {
    return fa(d.toISOString().slice(0, 10));
  }
}
function timeFa(ts) {
  const d = new Date(ts * 1000);
  try {
    return dateFa(ts) + " " + fa(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran", hour12: false }).format(d));
  } catch {
    return dateFa(ts);
  }
}
function costInline(cost) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${RES[k].emoji}${num(cost[k])}`).join(" ");
}
function costLines(cost, st) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${st.res[k] >= cost[k] ? "✅" : "❌"} ${RES[k].emoji} ${RES[k].name}: ${num(cost[k])} (دارید: ${num(st.res[k])})`).join(`
`);
}
function canAfford(st, cost) {
  return RES_KEYS.every((k) => st.res[k] >= (cost[k] || 0));
}
function scaleCost(cost, mult, n = 1) {
  const out = {};
  for (const k of RES_KEYS)
    if (cost[k])
      out[k] = Math.max(1, Math.ceil(cost[k] * mult)) * n;
  return out;
}
function spendMem(st, cost) {
  for (const k of RES_KEYS)
    if (cost[k])
      st.res[k] -= cost[k];
}
function spendStmt(db, playerId, cost) {
  const keys = RES_KEYS.filter((k) => cost[k]);
  const sets = keys.map((k) => `${k} = ${k} - ?`).join(", ");
  return db.prepare(`UPDATE resources SET ${sets} WHERE player_id = ?`).bind(...keys.map((k) => cost[k]), playerId);
}
function logStmt(db, now, actor, action, detail) {
  return db.prepare("INSERT INTO action_log (at, actor, action, detail) VALUES (?, ?, ?, ?)").bind(now, actor, action, detail.slice(0, 300));
}
function cleanName(s) {
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}
function nameLen(s) {
  return Array.from(s).length;
}
function clip(s, n) {
  const a = Array.from(s);
  return a.length > n ? a.slice(0, n - 1).join("") + "…" : s;
}

// src/modules/resources.ts
var bLvl = (st, k) => st.b[k] || 0;
var tLvl = (st, k) => st.t[k] || 0;
var PROD = {
  central: { res: "gold", base: 60, per: 60 },
  mine: { res: "iron", base: 0, per: 80 },
  refinery: { res: "oil", base: 0, per: 50 },
  power: { res: "energy", base: 20, per: 60 },
  research: { res: "tech", base: 0, per: 10 }
};
var STEEL_PER_LEVEL = 30;
function prodMult(st) {
  return st.cfg.prod_mult * (1 + 0.05 * tLvl(st, "industry"));
}
function armyUpkeep(st) {
  let s = 0;
  for (const [k, q] of Object.entries(st.u))
    if (U[k] && q > 0)
      s += U[k].upkeep * q;
  return s;
}
function rates(st) {
  const m = prodMult(st);
  const r = { gold: 0, oil: 0, iron: 0, energy: 0, tech: 0, steel: 0, upkeep: armyUpkeep(st) };
  for (const [bk, p] of Object.entries(PROD)) {
    const lv = bLvl(st, bk);
    if (lv > 0 || p.base > 0)
      r[p.res] += (p.base + p.per * lv) * m;
  }
  r.steel = STEEL_PER_LEVEL * bLvl(st, "steelfactory") * m;
  return r;
}
function storageCap(st) {
  const w = Math.max(1, bLvl(st, "warehouse"));
  return Math.round(4000 * Math.pow(1.45, w - 1) * (1 + 0.1 * tLvl(st, "logistics")));
}
var addCapped = (old, add, cap) => old >= cap ? old : Math.min(cap, old + add);
function advance(st, sec) {
  if (sec <= 0)
    return;
  const h = sec / 3600;
  const r = rates(st);
  const cap = storageCap(st);
  const s = st.res;
  s.gold = addCapped(s.gold, r.gold * h, cap);
  s.oil = addCapped(s.oil, r.oil * h, cap);
  s.iron = addCapped(s.iron, r.iron * h, cap);
  s.tech = addCapped(s.tech, r.tech * h, cap);
  if (r.steel > 0) {
    const made = Math.max(0, Math.min(r.steel * h, s.iron / 2, Math.max(0, cap - s.steel)));
    s.iron -= made * 2;
    s.steel += made;
  }
  const net = (r.energy - r.upkeep) * h;
  s.energy = net >= 0 ? addCapped(s.energy, net, cap) : Math.max(0, s.energy + net);
  for (const k of RES_KEYS)
    if (s[k] < 0)
      s[k] = 0;
}
function tick(st, now) {
  const finished = [];
  let t = st.p.last_tick;
  if (now < t)
    now = t;
  const due = st.q.filter((x) => x.finish_at <= now).sort((a, b) => a.finish_at - b.finish_at);
  for (const ev of due) {
    const at = Math.max(t, ev.finish_at);
    advance(st, at - t);
    t = at;
    if (ev.kind === "b")
      st.b[ev.key] = ev.to_level;
    else
      st.t[ev.key] = ev.to_level;
    finished.push(ev);
  }
  advance(st, now - t);
  st.p.last_tick = now;
  if (finished.length)
    st.q = st.q.filter((x) => !finished.includes(x));
  return finished;
}

// src/modules/army.ts
var unitQty = (st, k) => st.u[k] || 0;
var COMBAT = ["air", "inf", "tank"];
function techMult(st, g) {
  const tk = GROUP_TECH[g];
  return 1 + (tk ? 0.04 * tLvl(st, tk) : 0);
}
function armyStats(st) {
  let atk = 0;
  let def = 0;
  let combat = 0;
  let total = 0;
  const byGroup = { air: 0, inf: 0, tank: 0, def: 0, sup: 0 };
  for (const [k, q] of Object.entries(st.u)) {
    const u = U[k];
    if (!u || q <= 0)
      continue;
    const m = techMult(st, u.group);
    byGroup[u.group] += q;
    total += q;
    if (COMBAT.includes(u.group)) {
      atk += q * u.atk * m;
      combat += q;
    }
    def += q * u.def * m;
  }
  const atkBonus = Math.min(0.2, unitQty(st, "s1") * 0.004);
  const lossReduction = Math.min(0.3, unitQty(st, "s2") * 0.005);
  const defBonus = Math.min(0.25, unitQty(st, "s3") * 0.006);
  const baseDef = 40 + 25 * bLvl(st, "central");
  const r = rates(st);
  const shortage = st.res.energy < 1 && r.upkeep > r.energy;
  return {
    atk: atk * (1 + atkBonus),
    def: def * (1 + defBonus) + baseDef,
    baseDef,
    upkeep: armyUpkeep(st),
    combatUnits: combat,
    totalUnits: total,
    byGroup,
    atkBonus,
    defBonus,
    lossReduction,
    shortage
  };
}
function computePower(st) {
  let p = 0;
  for (const [k, q] of Object.entries(st.u)) {
    const u = U[k];
    if (!u || q <= 0)
      continue;
    p += q * (u.atk + u.def) * techMult(st, u.group);
  }
  for (const v of Object.values(st.b))
    p += v * 25;
  for (const v of Object.values(st.t))
    p += v * 40;
  return Math.round(p);
}
function capInfo(st, building) {
  const total = (CAP_PER_LEVEL[building] || 0) * bLvl(st, building);
  let used = 0;
  for (const [k, q] of Object.entries(st.u)) {
    const u = U[k];
    if (u && u.capBuilding === building)
      used += q * u.slots;
  }
  return { used, total };
}
function unitReqs(st, u) {
  const lines = [];
  let ok = true;
  const reqB = (key, lv) => {
    const have = bLvl(st, key);
    const good = have >= lv;
    if (!good)
      ok = false;
    lines.push(`${good ? "✅" : "\uD83D\uDD12"} ${B[key].emoji} ${B[key].name} سطح ${fa(lv)} (فعلی: ${fa(have)})`);
  };
  reqB(u.building, u.bLevel);
  if (u.also)
    reqB(u.also.building, u.also.level);
  if (u.tech) {
    const have = tLvl(st, u.tech.key);
    const good = have >= u.tech.level;
    if (!good)
      ok = false;
    lines.push(`${good ? "✅" : "\uD83D\uDD12"} ${T[u.tech.key].emoji} ${T[u.tech.key].name} سطح ${fa(u.tech.level)} (فعلی: ${fa(have)})`);
  }
  return { ok, lines };
}
var unitCost = (u, st, n = 1) => scaleCost(u.cost, st.cfg.price_mult, n);
function maxBuy(st, u) {
  const c1 = unitCost(u, st, 1);
  let m = Infinity;
  for (const k of Object.keys(c1))
    m = Math.min(m, Math.floor(st.res[k] / c1[k]));
  const ci = capInfo(st, u.capBuilding);
  m = Math.min(m, Math.floor((ci.total - ci.used) / u.slots));
  return Number.isFinite(m) ? Math.max(0, m) : 0;
}
function checkBuy(st, u, n) {
  if (!Number.isInteger(n) || n < 1 || n > 1000)
    return "تعداد نامعتبر است.";
  const rq = unitReqs(st, u);
  if (!rq.ok)
    return "شرایط خرید این تجهیزات (ساختمان یا فناوری) کامل نیست.";
  const ci = capInfo(st, u.capBuilding);
  if (ci.used + u.slots * n > ci.total)
    return `ظرفیت ${B[u.capBuilding].name} کافی نیست (${fa(ci.used)} / ${fa(ci.total)}). ساختمان را ارتقا بده.`;
  if (!canAfford(st, unitCost(u, st, n)))
    return "منابع کافی نیست.";
  return null;
}
async function buyUnit(ctx, st, key, nRaw) {
  const u = U[key];
  if (!u)
    return { alert: "تجهیزات نامعتبر است." };
  const n = nRaw === "m" ? maxBuy(st, u) : parseInt(nRaw, 10);
  if (nRaw === "m" && n < 1)
    return { alert: "با منابع و ظرفیت فعلی نمی‌توانی حتی یک واحد بخری." };
  const err = checkBuy(st, u, n);
  if (err)
    return { alert: err };
  const cost = unitCost(u, st, n);
  spendMem(st, cost);
  st.u[key] = unitQty(st, key) + n;
  try {
    await commit(ctx, st, [
      spendStmt(ctx.db, st.p.id, cost),
      ctx.db.prepare("INSERT INTO units (player_id, key, qty) VALUES (?, ?, ?) ON CONFLICT(player_id, key) DO UPDATE SET qty = qty + excluded.qty").bind(st.p.id, key, n),
      logStmt(ctx.db, ctx.now, st.p.id, "buy", `${key} x${n}`)
    ]);
  } catch {
    return { alert: "خرید انجام نشد (موجودی کافی نیست). دوباره تلاش کن." };
  }
  return { alert: `✅ ${fa(n)} × ${u.name} خریداری شد.` };
}
function screenArmy(st) {
  const a = armyStats(st);
  const g = a.byGroup;
  const text = [
    H("ارتش"),
    LINE,
    `🔥 قدرت حمله : ${num(a.atk)}`,
    `🛡 قدرت دفاع : ${num(a.def)}`,
    `⚡ نگهداری : ${num(a.upkeep)} انرژی در ساعت`,
    a.shortage ? "⚠️ انرژی تمام شده؛ قدرت ارتش کاهش یافته است!" : "",
    LINE,
    `✈️ جنگنده‌ها : ${num(g.air)}`,
    `🚜 تانک‌ها : ${num(g.tank)}`,
    `🪖 پیاده‌نظام : ${num(g.inf)}`,
    `🛡 پدافند : ${num(g.def)}`,
    `🚚 پشتیبانی : ${num(g.sup)}`,
    LINE,
    `🚚 پشتیبانی ➜ حمله +${pct(a.atkBonus * 100, 1)} | دفاع +${pct(a.defBonus * 100, 1)} | تلفات −${pct(a.lossReduction * 100, 1)}`
  ].filter((x) => x !== "").join("\n");
  return {
    text,
    kb: [
      [btn("✈️ نیروی هوایی", "br:air"), btn("🪖 نیروی زمینی", "br:gnd")],
      [btn("🛡 پدافند", "br:def"), btn("🚚 پشتیبانی", "br:sup")],
      homeRow()
    ]
  };
}
function screenBranch(st, br) {
  const info = BRANCHES[br];
  const lines = [H(info.name), LINE];
  const kb = [];
  for (const bk of info.buildings) {
    const lv = bLvl(st, bk);
    const ci = capInfo(st, bk);
    if (lv === 0) {
      lines.push(`${B[bk].emoji} ${B[bk].name} : ❌ ساخته نشده`);
    } else {
      lines.push(`${B[bk].emoji} ${B[bk].name} : سطح ${lv}  |  📦 ${ci.used}/${ci.total}`);
    }
  }
  const mine = unitsOfBranch(br).reduce((s, u) => s + unitQty(st, u.key), 0);
  lines.push(LINE, `🎖 تعداد واحدها : ${num(mine)}`);
  kb.push([btn(info.viewLabel, `bv:${br}`), btn("🏭 تجهیزات", `bs:${br}`)]);
  for (const bk of info.buildings) {
    const none = bLvl(st, bk) === 0;
    kb.push([btn(none ? `🏗 ساخت ${B[bk].name}` : `⬆️ ارتقای ${B[bk].name}`, `bd:${bk}`, "success")]);
  }
  kb.push(navRow("ar"));
  return { text: lines.join("\n"), kb };
}
function screenUnitsView(st, br) {
  const info = BRANCHES[br];
  const lines = [H(`واحدهای ${info.name}`), LINE];
  let any = false;
  for (const u of unitsOfBranch(br)) {
    const q = unitQty(st, u.key);
    if (q <= 0)
      continue;
    any = true;
    const m = techMult(st, u.group);
    lines.push(`${u.emoji} ${u.name} (نسل ${u.gen}) × ${num(q)}`);
    if (u.group === "sup")
      lines.push(`   ${SUPPORT_INFO[u.key]}`);
    else
      lines.push(`   🔥 ${num(q * u.atk * m)}   🛡 ${num(q * u.def * m)}`);
  }
  if (!any)
    lines.push("هنوز واحدی نداری. از «تجهیزات» شروع کن.");
  return { text: lines.join("\n"), kb: [[btn("🏭 تجهیزات", `bs:${br}`, "success")], navRow(`br:${br}`)] };
}
function screenShop(st, br) {
  const info = BRANCHES[br];
  const lines = [H(`تجهیزات ${info.name}`), LINE];
  const btns = [];
  for (const u of unitsOfBranch(br)) {
    const ok = unitReqs(st, u).ok;
    lines.push(`${ok ? "✅" : "🔒"} ${u.emoji} ${u.name} (نسل ${u.gen})`);
    lines.push(u.group === "sup" ? `   ${SUPPORT_INFO[u.key]}` : `   🔥 ${num(u.atk)}  🛡 ${num(u.def)}  📦 ${u.slots}`);
    lines.push(`   ${costInline(unitCost(u, st, 1))}`);
    btns.push(btn(`${ok ? "" : "🔒 "}${u.name}`, `un:${u.key}`));
  }
  lines.push(LINE, "روی هر مورد بزن تا جزئیات و خرید را ببینی.");
  return { text: lines.join("\n"), kb: [...chunk(btns, 2), navRow(`br:${br}`)] };
}
function screenUnit(st, key) {
  const u = U[key];
  const rq = unitReqs(st, u);
  const ci = capInfo(st, u.capBuilding);
  const lines = [
    H(`${u.emoji} ${u.name}`),
    `نسل ${u.gen}`,
    LINE,
    u.group === "sup" ? `🎯 اثر : ${SUPPORT_INFO[u.key]}` : `🔥 حمله : ${num(u.atk)}   🛡 دفاع : ${num(u.def)}`,
    `📦 ظرفیت : ${u.slots} در ${B[u.capBuilding].name}`,
    `⚡ نگهداری : ${u.upkeep} انرژی در ساعت`,
    LINE,
    "💵 هزینه هر واحد",
    costLines(unitCost(u, st, 1), st),
    LINE,
    "📌 شرایط",
    ...rq.lines,
    LINE,
    `🎖 موجودی : ${num(unitQty(st, key))}`,
    `📦 ظرفیت آزاد : ${Math.max(0, ci.total - ci.used)} از ${ci.total}`
  ];
  const kb = [];
  if (rq.ok) {
    kb.push([btn("خرید ×1", `ub:${key}:1`, "success"), btn("خرید ×5", `ub:${key}:5`, "success"), btn("خرید ×10", `ub:${key}:10`, "success")]);
    kb.push([btn(`خرید حداکثر (${num(maxBuy(st, u))})`, `ub:${key}:m`, "success")]);
  }
  kb.push(navRow(`bs:${u.branch}`));
  return { text: lines.join("\n"), kb };
}

// src/db/state.ts
async function loadState(ctx, id) {
  const db = ctx.db;
  const rs = await db.batch([
    db.prepare("SELECT * FROM players WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM resources WHERE player_id = ?").bind(id),
    db.prepare("SELECT key, level FROM buildings WHERE player_id = ?").bind(id),
    db.prepare("SELECT key, qty FROM units WHERE player_id = ?").bind(id),
    db.prepare("SELECT key, level FROM techs WHERE player_id = ?").bind(id),
    db.prepare("SELECT * FROM queue WHERE player_id = ?").bind(id)
  ]);
  const p = rs[0].results[0];
  if (!p)
    return null;
  const rr = rs[1].results[0] || {};
  const res = {};
  for (const k of RES_KEYS)
    res[k] = Number(rr[k] ?? 0);
  const b = {};
  for (const x of rs[2].results)
    b[x.key] = x.level;
  const u = {};
  for (const x of rs[3].results)
    u[x.key] = x.qty;
  const t = {};
  for (const x of rs[4].results)
    t[x.key] = x.level;
  const q = rs[5].results;
  const st = { p, res, b, u, t, q, cfg: await getCfg(db, Date.now()), finished: [] };
  st.finished = tick(st, ctx.now);
  st.p.power = computePower(st);
  return st;
}
async function commit(ctx, st, extra = []) {
  const db = ctx.db;
  st.p.power = computePower(st);
  const stmts = [
    db.prepare("UPDATE resources SET gold = ?, oil = ?, iron = ?, steel = ?, energy = ?, tech = ? WHERE player_id = ?").bind(...RES_KEYS.map((k) => st.res[k]), st.p.id),
    db.prepare("UPDATE players SET last_tick = ?, power = ? WHERE id = ?").bind(st.p.last_tick, st.p.power, st.p.id)
  ];
  for (const ev of st.finished) {
    if (ev.kind === "b") {
      stmts.push(db.prepare("INSERT INTO buildings (player_id, key, level) VALUES (?, ?, ?) ON CONFLICT(player_id, key) DO UPDATE SET level = excluded.level").bind(st.p.id, ev.key, ev.to_level));
    } else {
      stmts.push(db.prepare("INSERT INTO techs (player_id, key, level) VALUES (?, ?, ?) ON CONFLICT(player_id, key) DO UPDATE SET level = excluded.level").bind(st.p.id, ev.key, ev.to_level));
    }
    stmts.push(db.prepare("DELETE FROM queue WHERE id = ?").bind(ev.id));
  }
  const results = await db.batch([...stmts, ...extra]);
  st.finished = [];
  return results;
}
async function tryLock(ctx, id) {
  const nowMs = Date.now();
  const r = await ctx.db.prepare("UPDATE players SET lock_until = ? WHERE id = ? AND lock_until < ?").bind(nowMs + 8000, id, nowMs).run();
  return (r.meta.changes ?? 0) === 1;
}
async function unlock(ctx, id) {
  try {
    await ctx.db.prepare("UPDATE players SET lock_until = 0 WHERE id = ?").bind(id).run();
  } catch {}
}
async function ensurePlayer(ctx, user) {
  const db = ctx.db;
  const exists = await db.prepare("SELECT id FROM players WHERE id = ?").bind(user.id).first();
  if (exists)
    return false;
  const nm = clip(cleanName(user.first_name || ""), 16) || String(user.id);
  const cfg = await getCfg(db, Date.now());
  const stmts = [
    db.prepare("INSERT OR IGNORE INTO players (id, empire_name, created_at, last_tick, protected_until) VALUES (?, ?, ?, ?, ?)").bind(user.id, `امپراتوری ${nm}`, ctx.now, ctx.now, ctx.now + Math.round(cfg.protect_hours * 3600)),
    db.prepare("INSERT OR IGNORE INTO resources (player_id, gold, oil, iron, steel, energy, tech) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(user.id, ...RES_KEYS.map((k) => START_RES[k]))
  ];
  for (const [k, lv] of Object.entries(START_BUILDINGS)) {
    stmts.push(db.prepare("INSERT OR IGNORE INTO buildings (player_id, key, level) VALUES (?, ?, ?)").bind(user.id, k, lv));
  }
  stmts.push(db.prepare("INSERT INTO action_log (at, actor, action, detail) VALUES (?, ?, ?, ?)").bind(ctx.now, user.id, "join", ""));
  await db.batch(stmts);
  return true;
}

// src/telegram/api.ts
async function tg(env, method, body) {
  if (body && (method === "sendMessage" || method === "editMessageText" || method === "answerCallbackQuery")) {
    body = { ...body };
    if (typeof body.text === "string")
      body.text = boldDigits(body.text);
    if (body.reply_markup && body.reply_markup.inline_keyboard)
      body.reply_markup = { ...body.reply_markup, inline_keyboard: body.reply_markup.inline_keyboard.map((row) => row.map((b) => ({ ...b, text: boldDigits(b.text) }))) };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}
async function sendScreen(env, chatId, scr) {
  await tg(env, "sendMessage", { chat_id: chatId, text: scr.text, reply_markup: { inline_keyboard: scr.kb } });
}
async function showScreen(env, chatId, messageId, scr) {
  if (messageId) {
    const r = await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: scr.text,
      reply_markup: { inline_keyboard: scr.kb }
    });
    if (r.ok || String(r.description || "").includes("not modified"))
      return;
  }
  await sendScreen(env, chatId, scr);
}
async function answerCb(env, id, text) {
  await tg(env, "answerCallbackQuery", { callback_query_id: id, text: text || undefined, show_alert: !!text });
}
async function sendText(env, chatId, text) {
  await tg(env, "sendMessage", { chat_id: chatId, text });
}

// src/modules/scheduler.ts
async function runScheduled(env) {
  const now = Math.floor(Date.now() / 1000);
  const ctx = { env, db: env.DB, now };
  try {
    const due = await env.DB.prepare("SELECT DISTINCT player_id FROM queue WHERE finish_at <= ? LIMIT 6").bind(now).all();
    for (const row of due.results) {
      const id = row.player_id;
      if (!await tryLock(ctx, id))
        continue;
      try {
        const st = await loadState(ctx, id);
        if (!st || !st.finished.length)
          continue;
        const done = st.finished.slice();
        await commit(ctx, st, []);
        if (st.p.notify && !st.p.banned) {
          const lines = done.map((ev) => ev.kind === "b" ? `\uD83C\uDFD7 ${B[ev.key]?.name ?? ev.key} به سطح ${fa(ev.to_level)} رسید.` : `\uD83D\uDD2C تحقیق ${T[ev.key]?.name ?? ev.key} (سطح ${fa(ev.to_level)}) تمام شد.`);
          await sendScreen(env, id, { text: "✅ " + lines.join(`
✅ `), kb: [[btn("\uD83C\uDFF0 امپراتوری من", "h")]] });
        }
      } catch (e) {
        await logError(env, e);
      } finally {
        await unlock(ctx, id);
      }
    }
    if (new Date(now * 1000).getUTCMinutes() === 0) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM action_log WHERE at < ?").bind(now - 14 * 86400),
        env.DB.prepare("DELETE FROM error_log WHERE at < ?").bind(now - 7 * 86400),
        env.DB.prepare("DELETE FROM battles WHERE at < ?").bind(now - 60 * 86400)
      ]);
    }
  } catch (e) {
    await logError(env, e);
  }
}

// src/modules/admin.ts
var adminHome = () => [btn("\uD83D\uDEE0 پنل ادمین", "ad"), btn("\uD83C\uDFE0 منو", "h")];
function screenAdmin() {
  return {
    text: ["\uD83D\uDEE0 پنل مدیریت", LINE, "یک بخش را انتخاب کن:"].join(`
`),
    kb: [
      [btn("\uD83D\uDCCA وضعیت کلی بازی", "ad:s"), btn("\uD83D\uDC65 بازیکنان", "ad:p:0")],
      [btn("\uD83D\uDD0E جستجو با شناسه", "ad:f"), btn("⚙️ تنظیم بازی", "ad:c")],
      [btn("\uD83E\uDDFE لاگ عملیات", "ad:l"), btn("\uD83D\uDC1E گزارش خطاها", "ad:e")],
      homeRow()
    ]
  };
}
async function screenAdminStats(ctx) {
  const db = ctx.db;
  const [a, b, c, d, e] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n, SUM(banned) AS banned FROM players"),
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE last_tick > ?").bind(ctx.now - 86400),
    db.prepare("SELECT COUNT(*) AS n FROM battles"),
    db.prepare("SELECT COUNT(*) AS n FROM battles WHERE at > ?").bind(ctx.now - 86400),
    db.prepare("SELECT SUM(gold) AS gold, SUM(oil) AS oil, SUM(iron) AS iron, SUM(steel) AS steel, SUM(energy) AS energy, SUM(tech) AS tech FROM resources")
  ]);
  const p = a.results[0];
  const tot = e.results[0];
  const lines = [
    "\uD83D\uDCCA وضعیت کلی بازی",
    LINE,
    `\uD83D\uDC65 بازیکنان: ${num(p.n)} (مسدود: ${num(p.banned || 0)})`,
    `\uD83D\uDFE2 فعال در 24 ساعت اخیر: ${num(b.results[0].n)}`,
    `⚔️ کل نبردها: ${num(c.results[0].n)} | امروز: ${num(d.results[0].n)}`,
    LINE,
    "مجموع منابع بازیکنان:",
    ...RES_KEYS.map((k) => `${RES[k].emoji} ${RES[k].name}: ${num(tot[k] || 0)}`)
  ];
  return { text: lines.join(`
`), kb: [[btn("\uD83D\uDD04 به‌روزرسانی", "ad:s")], adminHome()] };
}
async function screenAdminPlayers(ctx, page) {
  const per = 8;
  const rows = await ctx.db.prepare("SELECT id, empire_name, power, banned FROM players ORDER BY power DESC, id ASC LIMIT ? OFFSET ?").bind(per + 1, page * per).all();
  const list = rows.results.slice(0, per);
  const lines = [`\uD83D\uDC65 بازیکنان — صفحه ${fa(page + 1)}`, LINE];
  const kb = [];
  for (const p of list) {
    lines.push(`${p.banned ? "\uD83D\uDEAB" : "•"} ${clip(p.empire_name, 20)} — ${p.id} — \uD83D\uDD25${num(p.power)}`);
    kb.push([btn(`${p.banned ? "\uD83D\uDEAB " : ""}${clip(p.empire_name, 16)} (${p.id})`, `ad:u:${p.id}`)]);
  }
  if (!list.length)
    lines.push("بازیکنی نیست.");
  const nav = [];
  if (page > 0)
    nav.push(btn("◀️ قبلی", `ad:p:${page - 1}`));
  if (rows.results.length > per)
    nav.push(btn("بعدی ▶️", `ad:p:${page + 1}`));
  if (nav.length)
    kb.push(nav);
  kb.push(adminHome());
  return { text: lines.join(`
`), kb };
}
async function screenAdminUser(ctx, id) {
  const t = await loadState(ctx, id);
  if (!t)
    return { text: "❌ بازیکنی با این شناسه پیدا نشد.", kb: [adminHome()] };
  const a = armyStats(t);
  const bt = await ctx.db.prepare("SELECT COUNT(*) AS n FROM battles WHERE attacker_id = ?1 OR defender_id = ?1").bind(id).first();
  const lines = [
    `\uD83D\uDC64 ${t.p.empire_name}`,
    LINE,
    `\uD83C\uDD94 ${t.p.id}`,
    `\uD83D\uDD25 قدرت: ${num(t.p.power)}   ⚔️ نبردها: ${num(bt?.n ?? 0)}`,
    `\uD83C\uDFD7 ساختمان‌ها: ${Object.entries(t.b).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(" ")}`,
    `\uD83E\uDE96 نیروها: ${num(a.totalUnits)}`,
    `\uD83D\uDD2C فناوری‌ها: ${Object.entries(t.t).map(([k, v]) => `${k}:${v}`).join(" ") || "—"}`,
    LINE,
    ...RES_KEYS.map((k) => `${RES[k].emoji} ${RES[k].name}: ${num(t.res[k])}`),
    LINE,
    t.p.banned ? `\uD83D\uDEAB مسدود — دلیل: ${t.p.ban_reason || "-"}` : "✅ فعال"
  ];
  return {
    text: lines.join(`
`),
    kb: [
      [t.p.banned ? btn("✅ رفع مسدودی", `ad:ub:${id}`) : btn("\uD83D\uDEAB مسدود کردن", `ad:b:${id}`)],
      [btn("\uD83D\uDCB0 مدیریت منابع", `ad:rm:${id}`)],
      [btn("\uD83D\uDD04 به‌روزرسانی", `ad:u:${id}`), btn("\uD83D\uDC65 فهرست", "ad:p:0")],
      adminHome()
    ]
  };
}
function screenAdminRes(id) {
  const kb = RES_KEYS.map((k) => [btn(`➕ ${RES[k].emoji} ${RES[k].name}`, `ad:r:${id}:${k}:p`), btn(`➖ ${RES[k].emoji} ${RES[k].name}`, `ad:r:${id}:${k}:m`)]);
  kb.push(backRow(`ad:u:${id}`));
  return { text: ["\uD83D\uDCB0 مدیریت منابع", LINE, "یک منبع و عملیات را انتخاب کن؛ سپس مقدار را به‌صورت عدد بفرست."].join(`
`), kb };
}
function screenAdminCfg(cfg) {
  const lines = ["⚙️ تنظیم بازی", LINE];
  const btns = [];
  for (const [k, m] of Object.entries(CFG_META)) {
    lines.push(`• ${m.name}: ${cfg[k]}`);
    btns.push(btn(m.name.split(" (")[0], `ad:ce:${k}`));
  }
  lines.push(LINE, "روی هر مورد بزن تا مقدار جدید را بفرستی.");
  return { text: lines.join(`
`), kb: [...chunk(btns, 2), [btn("♻️ بازگشت به پیش‌فرض", "ad:cr")], adminHome()] };
}
async function screenAdminLogs(ctx) {
  const rows = await ctx.db.prepare("SELECT at, actor, action, detail FROM action_log ORDER BY id DESC LIMIT 20").all();
  const lines = ["\uD83E\uDDFE آخرین عملیات", LINE];
  for (const r of rows.results)
    lines.push(`${timeFa(r.at)} | ${r.actor} | ${r.action} ${r.detail || ""}`);
  if (!rows.results.length)
    lines.push("خالی");
  return { text: lines.join(`
`), kb: [[btn("\uD83D\uDD04 به‌روزرسانی", "ad:l")], adminHome()] };
}
async function screenAdminErrors(ctx) {
  const rows = await ctx.db.prepare("SELECT at, message FROM error_log ORDER BY id DESC LIMIT 8").all();
  const lines = ["\uD83D\uDC1E گزارش خطاها", LINE];
  for (const r of rows.results)
    lines.push(`${timeFa(r.at)}
${r.message.slice(0, 300)}
`);
  if (!rows.results.length)
    lines.push("✅ خطایی ثبت نشده.");
  return { text: lines.join(`
`).slice(0, 3900), kb: [[btn("\uD83D\uDDD1 پاک‌کردن", "ad:ec"), btn("\uD83D\uDD04", "ad:e")], adminHome()] };
}
async function setBan(ctx, admin, id, reason) {
  const r = await ctx.db.prepare("UPDATE players SET banned = ?, ban_reason = ? WHERE id = ?").bind(reason === null ? 0 : 1, reason, id).run();
  if (!r.meta.changes)
    return "بازیکن پیدا نشد.";
  await ctx.db.batch([logStmt(ctx.db, ctx.now, admin.p.id, reason === null ? "unban" : "ban", `${id} ${reason || ""}`)]);
  return reason === null ? "✅ مسدودی برداشته شد." : "\uD83D\uDEAB بازیکن مسدود شد.";
}
async function adjustResource(ctx, admin, id, res, sign, amount) {
  if (!await tryLock(ctx, id))
    return "⏳ بازیکن مشغول است؛ چند ثانیه بعد دوباره تلاش کن.";
  try {
    const t = await loadState(ctx, id);
    if (!t)
      return "بازیکن پیدا نشد.";
    const before = t.res[res];
    t.res[res] = Math.max(0, before + sign * amount);
    await commit(ctx, t, [logStmt(ctx.db, ctx.now, admin.p.id, "admin_res", `${id} ${res} ${sign > 0 ? "+" : "-"}${amount} (${Math.round(before)} -> ${Math.round(t.res[res])})`)]);
    return `✅ ${RES[res].name}: ${num(before)} ← ${num(t.res[res])}`;
  } finally {
    await unlock(ctx, id);
  }
}
async function setCfgValue(ctx, admin, key, value) {
  const m = CFG_META[key];
  if (!m)
    return "تنظیم نامعتبر.";
  if (!Number.isFinite(value) || value < m.min || value > m.max)
    return `❌ مقدار باید بین ${m.min} و ${m.max} باشد.`;
  await ctx.db.batch([
    ctx.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value),
    logStmt(ctx.db, ctx.now, admin.p.id, "admin_cfg", `${key}=${value}`)
  ]);
  invalidateCfg();
  return `✅ ${m.name} = ${value}`;
}
async function resetCfg(ctx, admin) {
  await ctx.db.batch([ctx.db.prepare("DELETE FROM settings"), logStmt(ctx.db, ctx.now, admin.p.id, "admin_cfg_reset", "")]);
  invalidateCfg();
}

// src/modules/battle.ts
var LOOT_KEYS = ["gold", "oil", "iron", "steel"];
var ATTACKER_GROUPS = new Set(["air", "inf", "tank"]);
function checkAttack(att, target, now) {
  if (att.p.id === target.p.id)
    return "نمی‌توانی به خودت حمله کنی.";
  if (target.p.banned)
    return "این بازیکن در دسترس نیست.";
  if (target.p.protected_until > now)
    return `\uD83D\uDEE1 این بازیکن ${dur(target.p.protected_until - now)} دیگر تحت محافظت است.`;
  const wait = att.p.last_attack_at + att.cfg.attack_cooldown - now;
  if (wait > 0)
    return `⏳ نیروهایت استراحت می‌کنند. ${dur(wait)} دیگر می‌توانی حمله کنی.`;
  const a = armyStats(att);
  if (a.combatUnits <= 0)
    return "نیروی تهاجمی نداری (جنگنده، تانک یا پیاده‌نظام بخر).";
  if (att.res.energy < att.cfg.attack_energy)
    return `⚡ انرژی کافی نیست (نیاز: ${num(att.cfg.attack_energy)}).`;
  if (target.p.power < att.p.power * att.cfg.min_target_ratio)
    return "قدرت این هدف خیلی کمتر از توست؛ حمله مجاز نیست.";
  return null;
}
function applyLoss(st, pct, rnd, groups) {
  const out = {};
  for (const [k, q] of Object.entries(st.u)) {
    const u = U[k];
    if (!u || q <= 0 || u.group === "sup")
      continue;
    if (groups && !groups.has(u.group))
      continue;
    const lost = Math.min(q, Math.round(q * pct * (0.85 + rnd() * 0.3)));
    if (lost > 0) {
      out[k] = lost;
      st.u[k] = q - lost;
    }
  }
  return out;
}
async function doAttack(ctx, att, targetId) {
  if (targetId === att.p.id)
    return { alert: "نمی‌توانی به خودت حمله کنی." };
  if (!await tryLock(ctx, targetId))
    return { alert: "⏳ هدف هم‌اکنون مشغول است. چند ثانیه بعد دوباره تلاش کن." };
  try {
    const def = await loadState(ctx, targetId);
    if (!def)
      return { alert: "این بازیکن پیدا نشد." };
    const err = checkAttack(att, def, ctx.now);
    if (err)
      return { alert: err };
    const rnd = Math.random;
    const aS = armyStats(att);
    const dS = armyStats(def);
    const aPow = aS.atk * (aS.shortage ? 0.75 : 1);
    const dPow = dS.def * (dS.shortage ? 0.85 : 1);
    const a = aPow * (0.9 + rnd() * 0.2);
    const d = dPow * (0.9 + rnd() * 0.2);
    const attackerWins = a > d;
    const close = Math.min(a, d) / Math.max(a, d, 0.000000001);
    const winLoss = 0.03 + 0.1 * close;
    const loseLoss = 0.12 + 0.13 * (1 - close);
    const aPct = (attackerWins ? winLoss : loseLoss) * (1 - aS.lossReduction);
    const dPct = (attackerWins ? loseLoss : winLoss) * (1 - dS.lossReduction);
    const aLoss = applyLoss(att, aPct, rnd, ATTACKER_GROUPS);
    const dLoss = applyLoss(def, dPct, rnd, null);
    att.res.energy = Math.max(0, att.res.energy - att.cfg.attack_energy);
    const loot = {};
    if (attackerWins) {
      const cap = storageCap(att);
      for (const k of LOOT_KEYS) {
        const want = Math.floor(def.res[k] * att.cfg.loot_pct);
        const room = Math.max(0, Math.floor(cap - att.res[k]));
        const got = Math.min(want, room);
        if (got > 0) {
          loot[k] = got;
          def.res[k] -= got;
          att.res[k] += got;
        }
      }
    }
    att.p.last_attack_at = ctx.now;
    att.p.protected_until = 0;
    if (attackerWins)
      def.p.protected_until = Math.max(def.p.protected_until, ctx.now + Math.round(att.cfg.shield_seconds));
    const db = ctx.db;
    const unitStmts = (st, keys) => keys.map((k) => db.prepare("INSERT INTO units (player_id, key, qty) VALUES (?, ?, ?) ON CONFLICT(player_id, key) DO UPDATE SET qty = excluded.qty").bind(st.p.id, k, st.u[k]));
    def.p.power = computePower(def);
    const defStmts = [
      db.prepare("UPDATE resources SET gold = ?, oil = ?, iron = ?, steel = ?, energy = ?, tech = ? WHERE player_id = ?").bind(...RES_KEYS.map((k) => def.res[k]), def.p.id),
      db.prepare("UPDATE players SET last_tick = ?, power = ?, protected_until = ? WHERE id = ?").bind(def.p.last_tick, def.p.power, def.p.protected_until, def.p.id),
      ...unitStmts(def, Object.keys(dLoss))
    ];
    for (const ev of def.finished) {
      defStmts.push(ev.kind === "b" ? db.prepare("INSERT INTO buildings (player_id, key, level) VALUES (?, ?, ?) ON CONFLICT(player_id, key) DO UPDATE SET level = excluded.level").bind(def.p.id, ev.key, ev.to_level) : db.prepare("INSERT INTO techs (player_id, key, level) VALUES (?, ?, ?) ON CONFLICT(player_id, key) DO UPDATE SET level = excluded.level").bind(def.p.id, ev.key, ev.to_level), db.prepare("DELETE FROM queue WHERE id = ?").bind(ev.id));
    }
    const battleIns = db.prepare("INSERT INTO battles (at, attacker_id, defender_id, attacker_name, defender_name, winner, atk_power, def_power, loot, a_loss, d_loss) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(ctx.now, att.p.id, def.p.id, att.p.empire_name, def.p.empire_name, attackerWins ? 1 : 0, Math.round(a), Math.round(d), JSON.stringify(loot), JSON.stringify(aLoss), JSON.stringify(dLoss));
    const results = await commit(ctx, att, [
      ...defStmts,
      ...unitStmts(att, Object.keys(aLoss)),
      db.prepare("UPDATE players SET last_attack_at = ?, protected_until = 0 WHERE id = ?").bind(ctx.now, att.p.id),
      battleIns,
      logStmt(db, ctx.now, att.p.id, "attack", `${def.p.id} win=${attackerWins ? 1 : 0}`)
    ]);
    def.finished = [];
    const battleId = Number(results[results.length - 2]?.meta?.last_row_id ?? 0);
    const row = {
      id: battleId,
      at: ctx.now,
      attacker_id: att.p.id,
      defender_id: def.p.id,
      attacker_name: att.p.empire_name,
      defender_name: def.p.empire_name,
      winner: attackerWins ? 1 : 0,
      atk_power: Math.round(a),
      def_power: Math.round(d),
      loot: JSON.stringify(loot),
      a_loss: JSON.stringify(aLoss),
      d_loss: JSON.stringify(dLoss)
    };
    if (def.p.notify && !def.p.banned) {
      try {
        await sendScreen(ctx.env, def.p.id, {
          text: `\uD83D\uDEA8 به امپراتوری شما حمله شد!
مهاجم: ${clip(att.p.empire_name, 22)}
نتیجه: ${attackerWins ? "❌ شکست خوردید" : "\uD83C\uDFC6 دفاع موفق بود"}`,
          kb: [[btn("\uD83D\uDCDC مشاهده گزارش", `rp:${row.id}`)]]
        });
      } catch {}
    }
    return { screen: reportScreen(row, att.p.id, "bt") };
  } finally {
    await unlock(ctx, targetId);
  }
}
function lossText(json) {
  const o = JSON.parse(json);
  const parts = Object.entries(o).map(([k, q]) => `${U[k]?.emoji ?? ""} ${U[k]?.name ?? k} ×${fa(q)}`);
  return parts.length ? parts.join("، ") : "بدون تلفات";
}
function lootText(json) {
  const o = JSON.parse(json);
  const parts = Object.entries(o).map(([k, v]) => `${RES[k]?.emoji ?? ""}${num(v)}`);
  return parts.length ? parts.join(" ") : "هیچ";
}
function reportScreen(b, viewer, backTo) {
  const isAtt = viewer === b.attacker_id;
  const won = isAtt ? b.winner === 1 : b.winner === 0;
  const lines = [
    H(`گزارش نبرد #${b.id}`),
    timeFa(b.at),
    LINE,
    won ? "🏆 نتیجه : پیروزی شما" : "💥 نتیجه : شکست شما",
    LINE,
    `⚔️ مهاجم : ${clip(b.attacker_name, 22)}${isAtt ? " (شما)" : ""}`,
    `🛡 مدافع : ${clip(b.defender_name, 22)}${!isAtt ? " (شما)" : ""}`,
    `🔥 قدرت حمله : ${num(b.atk_power)}`,
    `🛡 قدرت دفاع : ${num(b.def_power)}`,
    LINE,
    `☠️ تلفات مهاجم : ${lossText(b.a_loss)}`,
    `☠️ تلفات مدافع : ${lossText(b.d_loss)}`,
    `🎁 غنیمت : ${lootText(b.loot)}`
  ];
  return { text: lines.join("\n"), kb: [navRow(backTo)] };
}
async function screenBattles(ctx, st) {
  const rows = await ctx.db.prepare("SELECT * FROM battles WHERE attacker_id = ?1 OR defender_id = ?1 ORDER BY id DESC LIMIT 8").bind(st.p.id).all();
  const lines = [H("گزارش نبردها"), LINE];
  const kb = [];
  const a = armyStats(st);
  const cd = st.p.last_attack_at + st.cfg.attack_cooldown - ctx.now;
  lines.push(`🔥 قدرت حمله : ${num(a.atk)}`);
  lines.push(`⚡ انرژی هر حمله : ${num(st.cfg.attack_energy)}`);
  lines.push(cd > 0 ? `⏳ حمله بعدی : ${dur(cd)}` : "✅ آماده حمله");
  lines.push(LINE);
  if (!rows.results.length)
    lines.push("هنوز نبردی نداشته‌ای. از «بازیکنان و حمله» هدف انتخاب کن.");
  for (const b of rows.results) {
    const isAtt = b.attacker_id === st.p.id;
    const won = isAtt ? b.winner === 1 : b.winner === 0;
    const other = isAtt ? b.defender_name : b.attacker_name;
    kb.push([btn(`${won ? "🏆" : "💥"} ${isAtt ? "حمله به" : "حمله از"} ${clip(other, 16)}`, `rp:${b.id}`)]);
  }
  kb.push([btn("🎯 بازیکنان و حمله", "wd")], navRow("g:wd"));
  return { text: lines.join("\n"), kb };
}
async function screenReport(ctx, st, id) {
  const b = await ctx.db.prepare("SELECT * FROM battles WHERE id = ? AND (attacker_id = ? OR defender_id = ?)").bind(id, st.p.id, st.p.id).first();
  if (!b)
    return { text: "❌ گزارش پیدا نشد.", kb: [backRow("bt")] };
  return reportScreen(b, st.p.id, "bt");
}
function screenAttackConfirm(att, t) {
  const a = armyStats(att);
  const lines = [
    H(`حمله به ${clip(t.empire_name, 22)}`),
    LINE,
    `🔥 قدرت حمله شما : ${num(a.atk)}`,
    `🎯 قدرت کلی هدف : ${num(t.power)}`,
    `⚡ هزینه انرژی : ${num(att.cfg.attack_energy)} (موجودی: ${num(att.res.energy)})`,
    LINE,
    "◆ نتیجه با ضریب تصادفی کوچک تعیین می‌شود.",
    "◆ هر دو طرف مقداری از ارتش را از دست می‌دهند.",
    "◆ با حمله، محافظت تازه‌واردی شما پایان می‌یابد."
  ];
  return { text: lines.join("\n"), kb: [[btn("⚔️ شروع حمله", `ay:${t.id}`, "danger")], [btn("↩️ بازگشت", `pf:${t.id}`)]] };
}

// src/modules/buildings.ts
var levelCap = (st, key) => {
  const def = B[key];
  if (key === "central")
    return def.maxLevel;
  return Math.min(def.maxLevel, bLvl(st, "central") * 2);
};
var buildingQueue = (st) => st.q.find((x) => x.kind === "b");
function checkUpgrade(st, key) {
  const def = B[key];
  if (!def)
    return "ساختمان نامعتبر است.";
  const cur = bLvl(st, key);
  const target = cur + 1;
  if (cur >= def.maxLevel)
    return "این ساختمان به حداکثر سطح رسیده است.";
  if (buildingQueue(st))
    return "هم‌اکنون یک ساختمان در حال ساخت/ارتقاست. صبر کن تمام شود.";
  if (cur === 0 && bLvl(st, "central") < def.minCentral)
    return `برای ساخت این ساختمان، ساختمان مرکزی باید سطح ${fa(def.minCentral)} باشد.`;
  if (target > levelCap(st, key))
    return `سطح ساختمان مرکزی کافی نیست. (حداکثر سطح سایر ساختمان‌ها = 2 برابر سطح مرکزی)`;
  if (!canAfford(st, bCost(def, target, st.cfg)))
    return "منابع کافی نیست.";
  return null;
}
async function startUpgrade(ctx, st, key) {
  const err = checkUpgrade(st, key);
  if (err)
    return { alert: err };
  const def = B[key];
  const target = bLvl(st, key) + 1;
  const cost = bCost(def, target, st.cfg);
  const secs = bTime(def, target, st.cfg);
  spendMem(st, cost);
  st.q.push({ id: 0, player_id: st.p.id, kind: "b", key, to_level: target, finish_at: ctx.now + secs });
  try {
    await commit(ctx, st, [
      spendStmt(ctx.db, st.p.id, cost),
      ctx.db.prepare("INSERT INTO queue (player_id, kind, key, to_level, finish_at) VALUES (?, ?, ?, ?, ?)").bind(st.p.id, "b", key, target, ctx.now + secs),
      logStmt(ctx.db, ctx.now, st.p.id, "build", `${key} -> ${target}`)
    ]);
  } catch {
    return { alert: "عملیات انجام نشد (منابع کافی نیست یا صف پر است)." };
  }
  return { alert: `\uD83C\uDFD7 ${def.name} به سطح ${fa(target)} در ${dur(secs)} آماده می‌شود.` };
}
function prodText(st, key, level) {
  const m = prodMult(st);
  const p = PROD[key];
  const out = [];
  if (p)
    out.push(`${RES[p.res].emoji} تولید ${RES[p.res].name}: ${num((p.base + p.per * level) * m)} در ساعت`);
  if (key === "steelfactory")
    out.push(`\uD83D\uDD29 تبدیل تا ${num(STEEL_PER_LEVEL * level * m)} فولاد در ساعت (هر 1 فولاد = 2 آهن)`);
  if (key === "warehouse")
    out.push(`\uD83D\uDCE6 ظرفیت انبار: ${num(Math.round(4000 * Math.pow(1.45, Math.max(1, level) - 1) * (1 + 0.1 * (st.t["logistics"] || 0))))} از هر منبع`);
  if (CAP_PER_LEVEL[key])
    out.push(`\uD83D\uDCE6 ظرفیت نگهداری: ${num(CAP_PER_LEVEL[key] * level)} اسلات`);
  if (key === "central")
    out.push(`\uD83C\uDFD7 سقف سطح سایر ساختمان‌ها: ${fa(Math.min(10, level * 2))}`);
  return out.join(`
`);
}
function screenBuildings(st, now) {
  const q = buildingQueue(st);
  const ECON = ["central", "mine", "refinery", "power", "warehouse", "steelfactory", "research"];
  const MIL = ["barracks", "airfield", "tankfactory", "defense"];
  const row = (k) => {
    const d = B[k];
    const lv = bLvl(st, k);
    const inQ = q && q.key === k ? ` ⏳ ➜ ${q.to_level}` : "";
    return `${d.emoji} ${d.name} : ${lv === 0 ? "—" : lv}${inQ}`;
  };
  const lines = [H("ساختمان‌ها"), LINE, "◆ اقتصاد", ...ECON.map(row), "", "◆ نظامی", ...MIL.map(row), LINE];
  lines.push(q ? `🏗 در حال ساخت : ${B[q.key].name} ➜ ${q.to_level} (${dur(q.finish_at - now)})` : "🏗 صف ساخت خالی است.");
  const btns = [...ECON, ...MIL].map((k) => btn(`${B[k].emoji} ${B[k].name}`, `bd:${k}`));
  return { text: lines.join("\n"), kb: [...chunk(btns, 2), [btn("🔄 به‌روزرسانی", "bl")], navRow("g:emp")] };
}
function screenBuilding(st, key, now) {
  const d = B[key];
  const lv = bLvl(st, key);
  const q = buildingQueue(st);
  const target = lv + 1;
  const lines = [H(`${d.emoji} ${d.name}`), d.desc, LINE, `📊 سطح : ${lv === 0 ? "ساخته نشده" : lv} / ${d.maxLevel}`];
  if (lv > 0)
    lines.push(prodText(st, key, lv));
  if (q && q.key === key)
    lines.push(`⏳ در حال ارتقا به سطح ${q.to_level} — ${dur(q.finish_at - now)}`);
  if (lv < d.maxLevel) {
    lines.push(LINE, `⬆️ ${lv === 0 ? "ساخت" : "ارتقا به سطح " + target}`);
    lines.push(prodText(st, key, target));
    lines.push(`⏱ زمان : ${dur(bTime(d, target, st.cfg))}`);
    lines.push(costLines(bCost(d, target, st.cfg), st));
    if (lv === 0 && bLvl(st, "central") < d.minCentral)
      lines.push(`🔒 نیاز به ساختمان مرکزی سطح ${d.minCentral}`);
    else if (target > levelCap(st, key))
      lines.push("🔒 سطح ساختمان مرکزی کافی نیست");
  }
  const kb = [];
  if (lv < d.maxLevel)
    kb.push([btn(lv === 0 ? "🏗 شروع ساخت" : "⬆️ ارتقا", `bu:${key}`, "success")]);
  kb.push([btn("🔄 به‌روزرسانی", `bd:${key}`)], navRow("bl"));
  return { text: lines.join("\n"), kb };
}

// src/modules/economy.ts
function screenEconomy(st, now) {
  const r = rates(st);
  const cap = storageCap(st);
  const perHour = { gold: r.gold, oil: r.oil, iron: r.iron, steel: 0, energy: r.energy - r.upkeep, tech: r.tech };
  const lines = [H("منابع و اقتصاد"), LINE];
  for (const k of RES_KEYS) {
    let rate = perHour[k];
    let extra = "";
    if (k === "steel") {
      const conv = Math.min(r.steel, st.res.iron / 2);
      rate = conv;
      extra = r.steel > 0 ? "" : " (نیاز به کارخانه فولاد)";
    }
    if (k === "iron" && r.steel > 0)
      rate -= Math.min(r.steel, st.res.iron / 2) * 2;
    const sign = rate > 0 ? "+" : rate < 0 ? "-" : "";
    lines.push(`${RES[k].emoji} ${RES[k].name} : ${num(st.res[k])}`);
    lines.push(`   ${bar(st.res[k], cap)} ${sign}${num(Math.abs(rate))}/h${extra}`);
  }
  lines.push(LINE, `📦 ظرفیت انبار : ${num(cap)} از هر منبع`, `⚡ نگهداری ارتش : ${num(r.upkeep)} انرژی در ساعت`);
  const full = RES_KEYS.filter((k) => st.res[k] >= cap).map((k) => RES[k].name);
  if (full.length)
    lines.push(`⚠️ انبار پر است : ${full.join("، ")}`);
  const left = st.p.last_daily + Math.round(st.cfg.daily_cooldown_hours * 3600) - now;
  const kb = [
    [left > 0 ? btn(`🎁 پاداش روزانه (${dur(left)})`, "dl") : btn("🎁 دریافت پاداش روزانه", "dl", "success")],
    [btn("📖 کاربرد منابع", "hp:res"), btn("🔄 به‌روزرسانی", "ec")],
    navRow("g:emp")
  ];
  return { text: lines.join("\n"), kb };
}
async function claimDaily(ctx, st) {
  const cd = Math.round(st.cfg.daily_cooldown_hours * 3600);
  const left = st.p.last_daily + cd - ctx.now;
  if (left > 0)
    return { alert: `⏳ پاداش بعدی تا ${dur(left)} دیگر.` };
  const amount = Math.round(st.cfg.daily_gold * (1 + 0.2 * (bLvl(st, "central") - 1)));
  const cap = storageCap(st);
  const before = st.res.gold;
  st.res.gold = Math.max(before, Math.min(cap, before + amount));
  const got = st.res.gold - before;
  st.p.last_daily = ctx.now;
  await commit(ctx, st, [
    ctx.db.prepare("UPDATE players SET last_daily = ? WHERE id = ?").bind(ctx.now, st.p.id),
    logStmt(ctx.db, ctx.now, st.p.id, "daily", String(Math.round(got)))
  ]);
  return { alert: `\uD83C\uDF81 ${num(got)} طلا به خزانه‌ات اضافه شد.` };
}

// src/modules/research.ts
var researchQueue = (st) => st.q.find((x) => x.kind === "r");
function checkResearch(st, key) {
  const d = T[key];
  if (!d)
    return "فناوری نامعتبر است.";
  const cur = tLvl(st, key);
  if (cur >= d.max)
    return "این فناوری به حداکثر سطح رسیده است.";
  if (researchQueue(st))
    return "هم‌اکنون یک تحقیق در حال انجام است.";
  if (bLvl(st, "research") < tLabReq(cur + 1))
    return `مرکز تحقیقات سطح ${fa(tLabReq(cur + 1))} لازم است (فعلی: ${fa(bLvl(st, "research"))}).`;
  if (!canAfford(st, tCost(cur + 1, st.cfg)))
    return "منابع کافی نیست (فناوری یا طلا).";
  return null;
}
async function startResearch(ctx, st, key) {
  const err = checkResearch(st, key);
  if (err)
    return { alert: err };
  const target = tLvl(st, key) + 1;
  const cost = tCost(target, st.cfg);
  const secs = tTime(target, st.cfg);
  spendMem(st, cost);
  st.q.push({ id: 0, player_id: st.p.id, kind: "r", key, to_level: target, finish_at: ctx.now + secs });
  try {
    await commit(ctx, st, [
      spendStmt(ctx.db, st.p.id, cost),
      ctx.db.prepare("INSERT INTO queue (player_id, kind, key, to_level, finish_at) VALUES (?, ?, ?, ?, ?)").bind(st.p.id, "r", key, target, ctx.now + secs),
      logStmt(ctx.db, ctx.now, st.p.id, "research", `${key} -> ${target}`)
    ]);
  } catch {
    return { alert: "تحقیق شروع نشد (منابع کافی نیست یا صف پر است)." };
  }
  return { alert: `\uD83D\uDD2C تحقیق ${T[key].name} (سطح ${fa(target)}) در ${dur(secs)} تمام می‌شود.` };
}
function screenResearch(st, now) {
  const lab = bLvl(st, "research");
  const lines = [H("تحقیقات"), LINE];
  if (lab === 0)
    lines.push("⚠️ هنوز مرکز تحقیقات نساخته‌ای. اول آن را بساز.");
  else
    lines.push(`🏢 سطح مرکز تحقیقات : ${lab}`, `🔬 تولید فناوری : ${num(rates(st).tech)}/h`, `📚 موجودی فناوری : ${num(st.res.tech)}`);
  lines.push(LINE);
  const q = researchQueue(st);
  for (const t of TECHS) {
    const lv = tLvl(st, t.key);
    const inQ = q && q.key === t.key ? ` ⏳ (${dur(q.finish_at - now)})` : "";
    lines.push(`${t.emoji} ${t.name} : ${lv}/${t.max}${inQ}`);
  }
  lines.push(LINE, q ? `🔬 در حال تحقیق : ${T[q.key].name} ➜ ${q.to_level} (${dur(q.finish_at - now)})` : "🔬 صف تحقیق خالی است.");
  const btns = TECHS.map((t) => btn(`${t.emoji} ${t.name}`, `rd:${t.key}`));
  return { text: lines.join("\n"), kb: [...chunk(btns, 2), [btn("🔄 به‌روزرسانی", "rs")], homeRow()] };
}
function screenTech(st, key, now) {
  const t = T[key];
  const lv = tLvl(st, key);
  const q = researchQueue(st);
  const lines = [H(`${t.emoji} ${t.name}`), t.desc, LINE, `📊 سطح : ${lv} / ${t.max}`];
  if (q && q.key === key)
    lines.push(`⏳ در حال تحقیق : سطح ${q.to_level} — ${dur(q.finish_at - now)}`);
  if (lv < t.max) {
    const n = lv + 1;
    lines.push(LINE, `🔬 تحقیق سطح ${n}`, `⏱ زمان : ${dur(tTime(n, st.cfg))}`, costLines(tCost(n, st.cfg), st));
    const need = tLabReq(n);
    lines.push(`${bLvl(st, "research") >= need ? "✅" : "🔒"} مرکز تحقیقات سطح ${need} (فعلی: ${bLvl(st, "research")})`);
  }
  const kb = [];
  if (lv < t.max)
    kb.push([btn("🔬 شروع تحقیق", `ru:${key}`, "success")]);
  kb.push([btn("🔄 به‌روزرسانی", `rd:${key}`)], navRow("rs"));
  return { text: lines.join("\n"), kb };
}

// src/modules/users.ts
function screenHub(kind, st, now) {
  if (kind === "emp") {
    const q = buildingQueue(st);
    const text = [
      H("امپراتوری"),
      LINE,
      `🏛 سطح مرکزی : ${bLvl(st, "central")}`,
      `🔥 قدرت : ${num(st.p.power)}`,
      q ? `🏗 در حال ساخت : ${B[q.key].name} ➜ ${q.to_level} (${dur(q.finish_at - now)})` : "🏗 صف ساخت : خالی",
      LINE,
      "یک بخش را انتخاب کن:"
    ].join("\n");
    return { text, kb: [
      [btn("📊 وضعیت امپراتوری", "emp"), btn("🏗 ساختمان‌ها", "bl")],
      [btn("⛏ منابع و اقتصاد", "ec")],
      homeRow()
    ] };
  }
  if (kind === "wd") {
    const cd = st.p.last_attack_at + st.cfg.attack_cooldown - now;
    const text = [
      H("جهان"),
      LINE,
      `🔥 قدرت حمله : ${num(armyStats(st).atk)}`,
      cd > 0 ? `⏳ حمله بعدی : ${dur(cd)}` : "✅ آماده حمله",
      LINE,
      "یک بخش را انتخاب کن:"
    ].join("\n");
    return { text, kb: [
      [btn("🎯 بازیکنان و حمله", "wd"), btn("🏆 رتبه‌بندی", "rk")],
      [btn("📜 گزارش نبردها", "bt")],
      homeRow()
    ] };
  }
  return screenHome(st, false, now);
}
function screenHome(st, isAdmin, now) {
  const q = buildingQueue(st);
  const r = researchQueue(st);
  const lines = [
    H(st.p.empire_name),
    LINE,
    `🏛 سطح : ${bLvl(st, "central")}      🔥 قدرت : ${num(st.p.power)}`,
    LINE,
    RES_KEYS.slice(0, 3).map((k) => `${RES[k].emoji} ${num(st.res[k])}`).join("   "),
    RES_KEYS.slice(3).map((k) => `${RES[k].emoji} ${num(st.res[k])}`).join("   "),
    LINE
  ];
  lines.push(q ? `🏗 ${B[q.key].name} ➜ ${q.to_level} (${dur(q.finish_at - now)})` : "🏗 صف ساخت : خالی");
  lines.push(r ? `🔬 ${T[r.key].name} ➜ ${r.to_level} (${dur(r.finish_at - now)})` : "🔬 صف تحقیق : خالی");
  if (st.p.protected_until > now)
    lines.push(`🛡 محافظت : ${dur(st.p.protected_until - now)}`);
  return { text: lines.join("\n"), kb: mainMenu(isAdmin) };
}
async function rankOf(ctx, power) {
  const r = await ctx.db.prepare("SELECT COUNT(*) AS c FROM players WHERE banned = 0 AND power > ?").bind(power).first();
  return (r?.c ?? 0) + 1;
}
async function screenEmpire(ctx, st) {
  const rank = await rankOf(ctx, st.p.power);
  const total = await ctx.db.prepare("SELECT COUNT(*) AS c FROM players WHERE banned = 0").first();
  const built = Object.values(st.b).filter((v) => v > 0);
  const a = armyStats(st);
  const text = [
    H("وضعیت امپراتوری"),
    `👑 ${st.p.empire_name}`,
    LINE,
    `🆔 شناسه : ${st.p.id}`,
    `🏛 سطح مرکزی : ${bLvl(st, "central")}`,
    `🔥 قدرت : ${num(st.p.power)}`,
    `🏆 رتبه : ${rank} از ${total?.c ?? 0}`,
    LINE,
    `🏗 ساختمان‌ها : ${built.length} (مجموع سطح: ${built.reduce((s, v) => s + v, 0)})`,
    `🪖 نیروها : ${num(a.totalUnits)}`,
    `🔬 مجموع سطح فناوری : ${Object.values(st.t).reduce((s, v) => s + v, 0)}`,
    LINE,
    `📅 عضویت : ${dateFa(st.p.created_at)}`,
    st.p.protected_until > ctx.now ? `🛡 محافظت : ${dur(st.p.protected_until - ctx.now)}` : ""
  ].filter((x) => x !== "").join("\n");
  return { text, kb: [[btn("🏆 رتبه‌بندی", "rk"), btn("⚙️ تنظیمات", "st")], navRow("g:emp")] };
}
async function screenRanking(ctx, st) {
  const rows = await ctx.db.prepare("SELECT id, empire_name, power FROM players WHERE banned = 0 ORDER BY power DESC, id ASC LIMIT 10").all();
  const medals = ["🥇", "🥈", "🥉"];
  const lines = [H("رتبه‌بندی جهانی"), LINE];
  rows.results.forEach((p, i) => {
    lines.push(`${medals[i] || (i + 1) + "."} ${clip(p.empire_name, 22)} ➜ 🔥 ${num(p.power)}${p.id === st.p.id ? "  ◀ شما" : ""}`);
  });
  const rank = await rankOf(ctx, st.p.power);
  lines.push(LINE, `📍 رتبه شما : ${rank}   🔥 ${num(st.p.power)}`);
  return { text: lines.join("\n"), kb: [[btn("🔄 به‌روزرسانی", "rk")], navRow("g:wd")] };
}
function screenSettings(st) {
  return {
    text: [H("تنظیمات"), LINE, `👑 نام امپراتوری : ${st.p.empire_name}`, `🔔 اعلان‌ها : ${st.p.notify ? "روشن" : "خاموش"}`].join("\n"),
    kb: [
      [btn("✏️ تغییر نام", "sr")],
      [st.p.notify ? btn("🔕 خاموش‌کردن اعلان‌ها", "sn", "danger") : btn("🔔 روشن‌کردن اعلان‌ها", "sn", "success")],
      [btn("📖 راهنمای بازی", "hp")],
      homeRow()
    ]
  };
}
function screenHelp(page, cfg) {
  cfg = cfg || DEFAULT_CFG;
  const topics = [
    ["start", "🚀 شروع بازی"],
    ["res", "💰 منابع"],
    ["bld", "🏗 ساختمان‌ها"],
    ["army", "⚔️ ارتش"],
    ["war", "🎯 نبرد"],
    ["tech", "🔬 تحقیقات"],
    ["sys", "⚙️ سیستم‌ها"],
    ["icons", "🔣 آیکون‌ها"]
  ];
  if (!page || !topics.some((t) => t[0] === page)) {
    return {
      text: [H("راهنمای EMPIRE WARS"), LINE, "موضوع مورد نظر را انتخاب کن:"].join("\n"),
      kb: [...chunk(topics.map(([k, l]) => btn(l, `hp:${k}`)), 2), homeRow()]
    };
  }
  const hr = (h) => [H(h), LINE];
  let lines;
  if (page === "start") {
    lines = [...hr("شروع بازی"),
      "1. در «امپراتوری ← ساختمان‌ها» معدن، پالایشگاه، نیروگاه و انبار را ارتقا بده تا منابع بیشتری بگیری.",
      "2. ساختمان مرکزی را بالا ببر؛ سقف سطح بقیه ساختمان‌ها و باز شدن ساختمان‌های جدید به آن بستگی دارد.",
      "3. کارخانه فولاد و مرکز تحقیقات را بساز (نیاز به مرکزی سطح 2).",
      "4. پادگان بساز و پیاده‌نظام بخر؛ بعد فرودگاه، کارخانه تانک‌سازی و مرکز پدافند.",
      "5. هر روز پاداش روزانه را از «منابع و اقتصاد» بگیر.",
      "6. وقتی ارتش داشتی، از «جهان ← بازیکنان و حمله» هدف انتخاب کن.",
      LINE,
      "هر ساختمان و هر تحقیق جداگانه صف دارد؛ هرکدام در هر لحظه یکی ساخته می‌شود."];
  } else if (page === "res") {
    lines = [...hr("منابع"),
      ...RES_KEYS.map((k) => `${RES[k].emoji} ${RES[k].name} : ${RES[k].use}`),
      LINE,
      "منبع هرکدام:",
      `💰 ساختمان مرکزی (پایه ${PROD.central.base} + ${PROD.central.per} در هر سطح، در ساعت)`,
      `⛓ معدن آهن (${PROD.mine.per} در هر سطح)`,
      `🛢 پالایشگاه (${PROD.refinery.per} در هر سطح)`,
      `⚡ نیروگاه (پایه ${PROD.power.base} + ${PROD.power.per} در هر سطح)`,
      `🔬 مرکز تحقیقات (${PROD.research.per} در هر سطح)`,
      `🔩 کارخانه فولاد (آهن را تبدیل می‌کند: هر 1 فولاد = 2 آهن، تا ${STEEL_PER_LEVEL} فولاد در ساعت به ازای هر سطح)`,
      LINE,
      "منابع حتی وقتی آفلاینی تولید می‌شوند، اما تا سقف انبار."];
  } else if (page === "bld") {
    lines = [...hr("ساختمان‌ها"),
      ...BUILDINGS.map((d) => `${d.emoji} ${d.name}${d.minCentral > 1 ? ` (مرکزی ${d.minCentral})` : ""}\n   ${d.desc}`),
      LINE,
      "ارتقا هزینه و زمان ساخت را بالا می‌برد ولی تولید، ظرفیت یا توان را بیشتر می‌کند. سقف سطح هر ساختمان = 2 × سطح ساختمان مرکزی (حداکثر 10)."];
  } else if (page === "army") {
    lines = [...hr("ارتش"),
      "✈️ جنگنده : حمله و دفاع بالا، گران؛ فرودگاه و فولاد می‌خواهد.",
      "🚜 تانک : دفاع بالا و حمله خوب؛ کارخانه تانک‌سازی و فولاد می‌خواهد.",
      "🪖 پیاده‌نظام : ارزان و کم‌مصرف؛ پادگان می‌خواهد.",
      "🛡 پدافند : فقط دفاع دارد (حمله ندارد)؛ مرکز پدافند می‌خواهد.",
      "🚚 پشتیبانی : حمله و دفاع مستقیم ندارد، فقط بونوس می‌دهد:",
      ...Object.values(SUPPORT_INFO).map((s) => `   ◆ ${s}`),
      LINE,
      "هر تجهیزات 5 نسل (پیاده‌نظام و پشتیبانی 3 نسل) دارد. نسل بالاتر قوی‌تر است و ساختمان با سطح بالاتر و فناوری مربوطه می‌خواهد."];
  } else if (page === "war") {
    lines = [...hr("نبرد"),
      "شرایط حمله:",
      "◆ حداقل یک واحد تهاجمی (جنگنده، تانک یا پیاده‌نظام)",
      `◆ ${cfg.attack_energy} انرژی برای هر حمله`,
      `◆ فاصله بین دو حمله : ${dur(cfg.attack_cooldown)}`,
      `◆ قدرت هدف حداقل ${Math.round(cfg.min_target_ratio * 100)}% قدرت تو باشد`,
      "◆ هدف تحت محافظت نباشد",
      LINE,
      "نتیجه: قدرت حمله تو با قدرت دفاع هدف (هر دو با ±10% شانس) مقایسه می‌شود.",
      "◆ هر دو طرف مقداری از نیروهای رزمی را از دست می‌دهند؛ بازنده بیشتر. واحدهای پشتیبانی، ساختمان‌ها و فناوری هرگز از بین نمی‌روند.",
      `◆ برنده ${Math.round(cfg.loot_pct * 100)}% از طلا، نفت، آهن و فولاد هدف را غنیمت می‌گیرد (تا سقف انبار خودش).`,
      `◆ مدافعی که ببازد ${dur(cfg.shield_seconds)} محافظت می‌گیرد.`,
      `◆ دفاع پایه هر امپراتوری = 40 + 25 × سطح مرکزی.`];
  } else if (page === "tech") {
    lines = [...hr("تحقیقات"),
      "برای تحقیق به مرکز تحقیقات نیاز داری؛ سطح مرکز تحقیقات باید حداقل برابر سطح هدف باشد.",
      "هزینه: فناوری + طلا. هزینه و زمان با هر سطح بیشتر می‌شود. حداکثر 5 سطح.",
      LINE,
      ...TECHS.map((t) => `${t.emoji} ${t.name}\n   ${t.desc}`)];
  } else if (page === "sys") {
    lines = [...hr("سیستم‌ها"),
      "📦 ظرفیت",
      `هر واحد چند اسلات از ساختمان خودش را اشغال می‌کند. اسلات هر سطح: فرودگاه ${CAP_PER_LEVEL.airfield}، پادگان ${CAP_PER_LEVEL.barracks}، تانک‌سازی ${CAP_PER_LEVEL.tankfactory}، پدافند ${CAP_PER_LEVEL.defense}. برای نیروی بیشتر ساختمان را ارتقا بده.`,
      "",
      "⚡ انرژی",
      "نیروگاه انرژی تولید می‌کند و ارتش هر ساعت مصرف می‌کند. هر حمله هم انرژی می‌برد. اگر انرژی تمام شود، قدرت حمله 25% و دفاع 15% کم می‌شود.",
      "",
      "🏭 تولید و انبار",
      "تولید ادامه دارد تا انبار پر شود. ظرفیت انبار = 4000 در سطح 1 و با هر سطح بیشتر می‌شود؛ فناوری لجستیک هم +10% در هر سطح اضافه می‌کند.",
      "",
      "🔥 قدرت بازیکن",
      "جمع (حمله + دفاع) نیروها + 25 به ازای هر سطح ساختمان + 40 به ازای هر سطح فناوری. رتبه و هدف‌یابی بر اساس همین است.",
      "",
      "🛡 محافظت",
      `تازه‌واردها ${Math.round(cfg.protect_hours)} ساعت قابل حمله نیستند. با اولین حمله خودت محافظت تمام می‌شود.`];
  } else {
    lines = [...hr("آیکون‌ها"),
      ...RES_KEYS.map((k) => `${RES[k].emoji} ${RES[k].name}`),
      LINE,
      "🔥 قدرت حمله / قدرت کلی",
      "🛡 دفاع / محافظت",
      "📦 ظرفیت یا انبار",
      "⚡ انرژی و نگهداری",
      "⏳ ⏱ زمان",
      "✅ شرط برقرار | 🔒 قفل | ❌ ناکافی",
      "⚠️ هشدار",
      "🏆 رتبه | 🎁 پاداش | ☠️ تلفات",
      "🟢 دکمه سبز: خرید، ساخت، ارتقا، پاداش",
      "🔵 دکمه آبی: مشاهده و منو",
      "🔴 دکمه قرمز: حمله و کارهای خطرناک"];
  }
  return { text: lines.join("\n"), kb: [[btn("📖 فهرست راهنما", "hp")], homeRow()] };
}
async function screenWorld(ctx, st) {
  const p = st.p.power;
  const lo = Math.floor(p * 0.5);
  const hi = Math.ceil(p * 2) + 100;
  let rows = (await ctx.db.prepare("SELECT id, empire_name, power, protected_until FROM players WHERE banned = 0 AND id != ? AND power BETWEEN ? AND ? ORDER BY RANDOM() LIMIT 8").bind(st.p.id, lo, hi).all()).results;
  if (rows.length < 3) {
    rows = (await ctx.db.prepare("SELECT id, empire_name, power, protected_until FROM players WHERE banned = 0 AND id != ? ORDER BY RANDOM() LIMIT 8").bind(st.p.id).all()).results;
  }
  const lines = [H("بازیکنان و حمله"), LINE, `🔥 قدرت شما : ${num(p)}`, LINE];
  const btns = [];
  if (!rows.length)
    lines.push("هنوز بازیکن دیگری پیدا نشد.");
  for (const r of rows) {
    const prot = r.protected_until > ctx.now ? " 🛡" : "";
    lines.push(`◆ ${clip(r.empire_name, 22)} ➜ 🔥 ${num(r.power)}${prot}`);
    btns.push([btn(`${clip(r.empire_name, 18)} • 🔥${num(r.power)}${prot}`, `pf:${r.id}`)]);
  }
  lines.push(LINE, "🛡 = تحت محافظت (قابل حمله نیست)");
  return { text: lines.join("\n"), kb: [...btns, [btn("🔄 جستجوی دیگر", "wd")], navRow("g:wd")] };
}
async function screenPlayer(ctx, st, targetId) {
  const t = await ctx.db.prepare("SELECT p.id, p.empire_name, p.power, p.protected_until, p.banned, p.created_at, (SELECT level FROM buildings WHERE player_id = p.id AND key = 'central') AS central FROM players p WHERE p.id = ?").bind(targetId).first();
  if (!t || t.banned)
    return { text: "❌ این بازیکن پیدا نشد.", kb: [backRow("wd")] };
  const rank = await rankOf(ctx, t.power);
  const lines = [
    H(t.empire_name),
    LINE,
    `🏛 سطح : ${t.central || 1}`,
    `🔥 قدرت : ${num(t.power)}`,
    `🏆 رتبه : ${rank}`,
    `📅 عضویت : ${dateFa(t.created_at)}`,
    t.protected_until > ctx.now ? `🛡 تحت محافظت (${dur(t.protected_until - ctx.now)})` : "⚠️ بدون محافظت"
  ];
  const kb = [];
  if (t.id !== st.p.id && t.protected_until <= ctx.now)
    kb.push([btn("⚔️ حمله", `at:${t.id}`, "danger")]);
  kb.push(navRow("wd"));
  return { text: lines.join("\n"), kb };
}
async function setNotify(ctx, st) {
  st.p.notify = st.p.notify ? 0 : 1;
  await ctx.db.prepare("UPDATE players SET notify = ? WHERE id = ?").bind(st.p.notify, st.p.id).run();
}
async function renameEmpire(ctx, st, raw) {
  const name = cleanName(raw);
  const n = nameLen(name);
  if (n < 3 || n > 24)
    return { ok: false, msg: "❌ نام باید بین 3 تا 24 حرف باشد. دوباره بفرست (یا /menu برای لغو)." };
  if (/^\//.test(name))
    return { ok: false, msg: "❌ نام نمی‌تواند با / شروع شود." };
  st.p.empire_name = name;
  await commit(ctx, st, [
    ctx.db.prepare("UPDATE players SET empire_name = ?, state = NULL WHERE id = ?").bind(name, st.p.id),
    ctx.db.prepare("INSERT INTO action_log (at, actor, action, detail) VALUES (?, ?, ?, ?)").bind(ctx.now, st.p.id, "rename", name)
  ]);
  return { ok: true, msg: `✅ نام امپراتوری شد: ${name}` };
}

// src/telegram/router.ts
var isAdmin = (env, id) => String(id) === String(env.ADMIN_ID).trim();
var MUT = new Set(["bu", "ub", "ru", "dl", "ay", "sn", "sr"]);
var ADMIN_MUT = new Set(["b", "ub", "r", "ce", "cr", "ec", "f"]);
var mkCtx = (env) => ({ env, db: env.DB, now: Math.floor(Date.now() / 1000) });
async function setState(ctx, id, state) {
  await ctx.db.prepare("UPDATE players SET state = ? WHERE id = ?").bind(state, id).run();
}
function parseNum(s) {
  const map = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "", ",": "" };
  const t = s.trim().replace(/[۰-۹٠-٩٫٬,]/g, (c) => map[c]);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
function promptScreen(text) {
  return { text: `${text}
${LINE}
برای لغو: /menu`, kb: [[btn("↩️ لغو", "h")]] };
}
function isResKey(s) {
  return RES_KEYS.includes(s);
}
async function onMessage(env, m) {
  if (!m.from || !m.chat || m.chat.type !== "private" || typeof m.text !== "string")
    return;
  const ctx = mkCtx(env);
  const user = m.from;
  const text = m.text.trim();
  const adm = isAdmin(env, user.id);
  const chatId = m.chat.id;
  if (/^\/(start|menu|help)(@\w+)?(\s|$)/i.test(text)) {
    const created = await ensurePlayer(ctx, user);
    let st = await loadState(ctx, user.id);
    if (!st)
      return;
    if (st.p.banned)
      return void await sendText(env, chatId, `\uD83D\uDEAB حساب شما مسدود شده است.
دلیل: ${st.p.ban_reason || "-"}`);
    if (st.p.state) {
      await setState(ctx, user.id, null);
      st.p.state = null;
    }
    if (/^\/help/i.test(text))
      return void await sendScreen(env, chatId, screenHelp(undefined, st.cfg));
    if (created) {
      await sendText(env, chatId, [
        H("EMPIRE WARS"),
        LINE,
        `👑 امپراتوری «${st.p.empire_name}» ساخته شد.`,
        `🛡 ${Math.round(st.cfg.protect_hours)} ساعت تحت محافظت هستی.`,
        LINE,
        "شروع: ◆ معدن، پالایشگاه و نیروگاه را ارتقا بده",
        "◆ بعد پادگان بساز و ارتش جمع کن",
        "📖 راهنما: /help"
      ].join(`\n`));
    }
    st = await loadState(ctx, user.id) || st;
    return void await sendScreen(env, chatId, screenHome(st, adm, ctx.now));
  }
  const st = await loadState(ctx, user.id);
  if (!st) {
    await ensurePlayer(ctx, user);
    const s2 = await loadState(ctx, user.id);
    if (s2)
      await sendScreen(env, chatId, screenHome(s2, adm, ctx.now));
    return;
  }
  if (st.p.banned)
    return void await sendText(env, chatId, `\uD83D\uDEAB حساب شما مسدود شده است.
دلیل: ${st.p.ban_reason || "-"}`);
  if (!st.p.state) {
    return void await sendScreen(env, chatId, screenHome(st, adm, ctx.now));
  }
  if (!await tryLock(ctx, user.id))
    return;
  try {
    await onStateText(ctx, st, text, adm, chatId);
  } finally {
    await unlock(ctx, user.id);
  }
}
async function onStateText(ctx, st, text, adm, chatId) {
  const env = ctx.env;
  const state = st.p.state || "";
  const clear = () => setState(ctx, st.p.id, null);
  if (state === "rename") {
    const r = await renameEmpire(ctx, st, text);
    await sendText(env, chatId, r.msg);
    if (r.ok)
      await sendScreen(env, chatId, screenSettings(st));
    return;
  }
  if (state.startsWith("a:")) {
    if (!adm) {
      await clear();
      return;
    }
    const p = state.split(":");
    if (p[1] === "find") {
      const id = parseNum(text);
      await clear();
      if (!Number.isInteger(id) || id <= 0)
        return void await sendScreen(env, chatId, { text: "❌ شناسه نامعتبر است.", kb: [[btn("\uD83D\uDEE0 پنل ادمین", "ad")]] });
      return void await sendScreen(env, chatId, await screenAdminUser(ctx, id));
    }
    if (p[1] === "res") {
      const id = Number(p[2]);
      const res = p[3];
      const sign = p[4] === "p" ? 1 : -1;
      const amount = parseNum(text);
      if (!isResKey(res))
        return void await clear();
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9)
        return void await sendText(env, chatId, "❌ یک عدد مثبت (حداکثر 1 میلیارد) بفرست یا /menu.");
      await clear();
      const msg = await adjustResource(ctx, st, id, res, sign, Math.floor(amount));
      await sendText(env, chatId, msg);
      return void await sendScreen(env, chatId, await screenAdminUser(ctx, id));
    }
    if (p[1] === "ban") {
      const id = Number(p[2]);
      await clear();
      const msg = await setBan(ctx, st, id, text.slice(0, 100) || "-");
      await sendText(env, chatId, msg);
      return void await sendScreen(env, chatId, await screenAdminUser(ctx, id));
    }
    if (p[1] === "cfg") {
      const v = parseNum(text);
      const msg = await setCfgValue(ctx, st, p[2], v);
      if (msg.startsWith("❌"))
        return void await sendText(env, chatId, msg + `
دوباره بفرست یا /menu.`);
      await clear();
      await sendText(env, chatId, msg);
      const st2 = await loadState(ctx, st.p.id);
      return void await sendScreen(env, chatId, screenAdminCfg(st2 ? st2.cfg : DEFAULT_CFG));
    }
  }
  await clear();
}
async function onCallback(env, q) {
  const ctx = mkCtx(env);
  const uid = q.from.id;
  const msg = q.message;
  if (!msg || !msg.chat || msg.chat.type !== "private")
    return void await answerCb(env, q.id);
  const chatId = msg.chat.id;
  const parts = String(q.data || "").split(":");
  const adm = isAdmin(env, uid);
  if (parts[0] === "ad" && !adm)
    return void await answerCb(env, q.id, "⛔ دسترسی ندارید.");
  const mutating = MUT.has(parts[0]) || parts[0] === "ad" && ADMIN_MUT.has(parts[1]);
  let locked = false;
  if (mutating) {
    locked = await tryLock(ctx, uid);
    if (!locked)
      return void await answerCb(env, q.id);
  }
  try {
    let st = await loadState(ctx, uid);
    if (!st) {
      await ensurePlayer(ctx, q.from);
      st = await loadState(ctx, uid);
    }
    if (!st)
      throw new Error("player not found");
    if (st.p.banned)
      return void await answerCb(env, q.id, `\uD83D\uDEAB حساب شما مسدود شده است.
دلیل: ${st.p.ban_reason || "-"}`);
    const r = await route(ctx, st, parts, adm);
    await answerCb(env, q.id, r.alert);
    if (r.screen)
      await showScreen(env, chatId, msg.message_id, r.screen);
  } catch (e) {
    await logError(env, e);
    await answerCb(env, q.id, "⚠️ خطای داخلی. دوباره تلاش کن.");
  } finally {
    if (locked)
      await unlock(ctx, uid);
  }
}
var isBranch = (s) => (s in BRANCHES);
async function route(ctx, st, p, adm) {
  const now = ctx.now;
  const a = p[0];
  const b = p[1];
  const home = () => screenHome(st, adm, now);
  switch (a) {
    case "h":
      if (st.p.state)
        await setState(ctx, st.p.id, null);
      return { screen: home() };
    case "x":
      return {};
    case "emp":
      return { screen: await screenEmpire(ctx, st) };
    case "rk":
      return { screen: await screenRanking(ctx, st) };
    case "st":
      return { screen: screenSettings(st) };
    case "hp":
      return { screen: screenHelp(b, st.cfg) };
    case "g":
      return b === "emp" || b === "wd" ? { screen: screenHub(b, st, now) } : { screen: home() };
    case "sn":
      await setNotify(ctx, st);
      return { screen: screenSettings(st) };
    case "sr":
      await setState(ctx, st.p.id, "rename");
      return { screen: promptScreen("✏️ نام جدید امپراتوری را بفرست (3 تا 24 حرف):") };
    case "bl":
      return { screen: screenBuildings(st, now) };
    case "bd":
      return B[b] ? { screen: screenBuilding(st, b, now) } : { screen: home() };
    case "bu": {
      if (!B[b])
        return { screen: home() };
      const r = await startUpgrade(ctx, st, b);
      return { alert: r.alert, screen: screenBuilding(st, b, now) };
    }
    case "rs":
      return { screen: screenResearch(st, now) };
    case "rd":
      return T[b] ? { screen: screenTech(st, b, now) } : { screen: home() };
    case "ru": {
      if (!T[b])
        return { screen: home() };
      const r = await startResearch(ctx, st, b);
      return { alert: r.alert, screen: screenTech(st, b, now) };
    }
    case "ar":
      return { screen: screenArmy(st) };
    case "br":
      return isBranch(b) ? { screen: screenBranch(st, b) } : { screen: home() };
    case "bv":
      return isBranch(b) ? { screen: screenUnitsView(st, b) } : { screen: home() };
    case "bs":
      return isBranch(b) ? { screen: screenShop(st, b) } : { screen: home() };
    case "un":
      return U[b] ? { screen: screenUnit(st, b) } : { screen: home() };
    case "ub": {
      if (!U[b])
        return { screen: home() };
      const r = await buyUnit(ctx, st, b, p[2] || "1");
      return { alert: r.alert, screen: screenUnit(st, b) };
    }
    case "ec":
      return { screen: screenEconomy(st, now) };
    case "dl": {
      const r = await claimDaily(ctx, st);
      return { alert: r.alert, screen: screenEconomy(st, now) };
    }
    case "wd":
      return { screen: await screenWorld(ctx, st) };
    case "pf":
      return { screen: await screenPlayer(ctx, st, Number(b)) };
    case "at": {
      const id = Number(b);
      const t = await ctx.db.prepare("SELECT id, empire_name, power, protected_until, banned FROM players WHERE id = ?").bind(id).first();
      if (!t || t.banned)
        return { alert: "این بازیکن پیدا نشد.", screen: await screenWorld(ctx, st) };
      if (t.id === st.p.id)
        return { alert: "نمی‌توانی به خودت حمله کنی." };
      if (t.protected_until > now)
        return { alert: "\uD83D\uDEE1 این بازیکن تحت محافظت است." };
      return { screen: screenAttackConfirm(st, t) };
    }
    case "ay": {
      const r = await doAttack(ctx, st, Number(b));
      if (r.screen)
        return { screen: r.screen };
      return { alert: r.alert, screen: await screenWorld(ctx, st) };
    }
    case "bt":
      return { screen: await screenBattles(ctx, st) };
    case "rp":
      return { screen: await screenReport(ctx, st, Number(b)) };
    case "ad":
      return adm ? adminRoute(ctx, st, p) : { alert: "⛔ دسترسی ندارید." };
  }
  return { screen: home() };
}
async function adminRoute(ctx, st, p) {
  const sub = p[1];
  switch (sub) {
    case undefined:
      return { screen: screenAdmin() };
    case "s":
      return { screen: await screenAdminStats(ctx) };
    case "p":
      return { screen: await screenAdminPlayers(ctx, Math.max(0, parseInt(p[2] || "0", 10) || 0)) };
    case "u":
      return { screen: await screenAdminUser(ctx, Number(p[2])) };
    case "rm":
      return { screen: screenAdminRes(Number(p[2])) };
    case "c":
      return { screen: screenAdminCfg(st.cfg) };
    case "l":
      return { screen: await screenAdminLogs(ctx) };
    case "e":
      return { screen: await screenAdminErrors(ctx) };
    case "ec":
      await ctx.db.prepare("DELETE FROM error_log").run();
      return { screen: await screenAdminErrors(ctx) };
    case "f":
      await setState(ctx, st.p.id, "a:find");
      return { screen: promptScreen("\uD83D\uDD0E شناسه عددی بازیکن را بفرست:") };
    case "b":
      await setState(ctx, st.p.id, `a:ban:${Number(p[2])}`);
      return { screen: promptScreen("\uD83D\uDEAB دلیل مسدودسازی را بفرست:") };
    case "ub": {
      const msg = await setBan(ctx, st, Number(p[2]), null);
      return { alert: msg, screen: await screenAdminUser(ctx, Number(p[2])) };
    }
    case "r": {
      const id = Number(p[2]);
      if (!isResKey(p[3]))
        return {};
      await setState(ctx, st.p.id, `a:res:${id}:${p[3]}:${p[4] === "p" ? "p" : "m"}`);
      return { screen: promptScreen(`${p[4] === "p" ? "➕ افزودن" : "➖ کسر"} — مقدار را به‌صورت عدد بفرست:`) };
    }
    case "ce": {
      const key = p[2];
      if (!(key in DEFAULT_CFG))
        return {};
      await setState(ctx, st.p.id, `a:cfg:${key}`);
      return { screen: promptScreen(`⚙️ مقدار جدید «${key}» را بفرست.
مقدار فعلی: ${st.cfg[key]} | پیش‌فرض: ${DEFAULT_CFG[key]}`) };
    }
    case "cr":
      await resetCfg(ctx, st);
      return { alert: "♻️ تنظیمات به پیش‌فرض برگشت.", screen: screenAdminCfg(DEFAULT_CFG) };
  }
  return { screen: screenAdmin() };
}
async function handleUpdate(env, update) {
  try {
    if (update.message)
      await onMessage(env, update.message);
    else if (update.callback_query)
      await onCallback(env, update.callback_query);
  } catch (e) {
    await logError(env, e);
  }
}

// src/index.ts
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/setup") {
      if (!env.WEBHOOK_SECRET || url.searchParams.get("key") !== env.WEBHOOK_SECRET)
        return new Response("forbidden", { status: 403 });
      const out = [];
      try {
        const cols = await env.DB.prepare("PRAGMA table_info(players)").all();
        if (cols.results.length && !cols.results.some((c) => c.name === "last_tick")) {
          await env.DB.prepare("DROP TABLE players").run();
          out.push("♻️ جدول آزمایشی مرحله 1 پاک شد و با ساختار کامل ساخته می‌شود");
        }
        await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
        out.push("✅ دیتابیس آماده شد (جدول‌ها ساخته/بررسی شدند)");
      } catch (e) {
        out.push("❌ خطای دیتابیس: " + String(e) + `
(مطمئن شو Binding با نام DB به Worker وصل است)`);
      }
      const wh = await tg(env, "setWebhook", {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true
      });
      out.push(wh.ok ? "✅ Webhook ثبت شد" : "❌ Webhook: " + JSON.stringify(wh));
      await tg(env, "setMyCommands", {
        commands: [
          { command: "start", description: "شروع / منوی اصلی" },
          { command: "menu", description: "منوی اصلی" },
          { command: "help", description: "راهنمای بازی" }
        ]
      });
      return new Response(out.join(`
`), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (request.method === "POST" && url.pathname === "/webhook") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET)
        return new Response("forbidden", { status: 403 });
      let update;
      try {
        update = await request.json();
      } catch {
        return new Response("bad request", { status: 400 });
      }
      ctx.waitUntil(handleUpdate(env, update).catch((e) => logError(env, e)));
      return new Response("ok");
    }
    return new Response("EMPIRE WARS is running ✅", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  }
};
export {
  src_default as default
};
