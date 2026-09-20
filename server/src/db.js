import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = new DatabaseSync(path.join(__dirname, "..", "cashplan.db"));

raw.exec(`
CREATE TABLE IF NOT EXISTS platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'pinjol' CHECK (type IN ('pinjol', 'paylater', 'lainnya')),
  total_limit REAL,
  remaining_limit REAL,
  due_date_type TEXT NOT NULL DEFAULT 'fixed_day' CHECK (due_date_type IN ('fixed_day', 'follow_transaction_date')),
  due_day INTEGER,
  interest_rate REAL NOT NULL DEFAULT 0,
  interest_period TEXT NOT NULL DEFAULT 'monthly' CHECK (interest_period IN ('monthly', 'yearly', 'daily')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pinjol', 'paylater', 'lainnya')),
  platform TEXT NOT NULL,
  outstanding REAL NOT NULL,
  limit_amount REAL,
  remaining_limit REAL,
  interest_rate REAL NOT NULL DEFAULT 0,
  interest_period TEXT NOT NULL DEFAULT 'monthly' CHECK (interest_period IN ('monthly', 'yearly', 'daily')),
  min_payment REAL,
  due_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debt_installments (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  month_number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expense_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  recurrence TEXT NOT NULL CHECK (recurrence IN ('once', 'monthly', 'weekday')),
  expense_day INTEGER,
  expense_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES expense_rules(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS income_rules (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'Gaji',
  amount REAL NOT NULL,
  income_day INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incomes (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES income_rules(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'Gaji',
  amount REAL NOT NULL,
  income_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migrasi ringan: tambah kolom baru ke tabel yang sudah ada tanpa menghapus data lama.
function ensureColumn(table, column, definition) {
  const cols = raw.prepare(`PRAGMA table_info(${table})`).all();
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("platforms", "interest_rate", "REAL NOT NULL DEFAULT 0");
ensureColumn("platforms", "interest_period", "TEXT NOT NULL DEFAULT 'monthly'");
ensureColumn("platforms", "tenors", "TEXT"); // JSON array string, mis. "[1,3,6,12]"
ensureColumn("platforms", "tenor_rates", "TEXT"); // JSON object string, mis. {"1":0,"3":3.5}
ensureColumn("debts", "tenor_months", "INTEGER");
ensureColumn("debts", "status", "TEXT NOT NULL DEFAULT 'active'"); // 'active' atau 'paid'
ensureColumn("debts", "transaction_date", "TEXT"); // tanggal pengajuan hutang
ensureColumn("debts", "principal", "REAL"); // plafon asli (pokok pinjaman), disimpan langsung dari input user

// Migrasi: hapus kolom yang sudah tidak dipakai lagi.
function dropColumnIfExists(table, column) {
  const cols = raw.prepare(`PRAGMA table_info(${table})`).all();
  const exists = cols.some((c) => c.name === column);
  if (exists) {
    raw.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}

dropColumnIfExists("debts", "disbursement_fee");
dropColumnIfExists("platforms", "disbursement_fee");

// Backfill: hitung & simpan plafon asli untuk hutang lama yang belum punya kolom principal,
// supaya tidak perlu dihitung balik terus-menerus dari outstanding (yang rapuh terhadap pembulatan).
function backfillPrincipal() {
  const debtsNeedingBackfill = raw
    .prepare(`SELECT * FROM debts WHERE principal IS NULL`)
    .all();
  const update = raw.prepare(`UPDATE debts SET principal = ? WHERE id = ?`);
  for (const debt of debtsNeedingBackfill) {
    const tenor = debt.tenor_months || 1;
    const rate = (debt.interest_rate || 0) / 100;
    const denom = 1 + rate * tenor;
    const principal = denom > 0 ? debt.outstanding / denom : debt.outstanding;
    update.run(Math.round(principal), debt.id);
  }
}

backfillPrincipal();

// Backfill: generate baris cicilan untuk hutang lama (bertenor) yang belum punya installments.
function formatDateLocalDb(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function backfillInstallments() {
  const debtsNeedingBackfill = raw
    .prepare(
      `SELECT d.* FROM debts d
       WHERE d.tenor_months IS NOT NULL AND d.tenor_months > 0 AND d.min_payment IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM debt_installments di WHERE di.debt_id = d.id)`
    )
    .all();

  const insert = raw.prepare(
    `INSERT INTO debt_installments (id, debt_id, month_number, due_date, amount, status) VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const debt of debtsNeedingBackfill) {
    const tenor = debt.tenor_months;
    const [dy, dm, dd] = debt.due_date.split("-").map(Number);
    const firstDue = new Date(dy, dm - 1, dd);
    for (let i = 1; i <= tenor; i++) {
      const targetMonth = firstDue.getMonth() + (i - 1);
      const d = new Date(firstDue.getFullYear(), targetMonth, 1);
      const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const day = Math.min(firstDue.getDate(), lastDayOfMonth);
      const dueDate = formatDateLocalDb(d.getFullYear(), d.getMonth(), day);
      const status = debt.status === "paid" ? "paid" : "unpaid";
      insert.run(`${debt.id}-m${i}`, debt.id, i, dueDate, debt.min_payment, status);
    }
  }
}

backfillInstallments();

// Thin wrapper providing the same .prepare(...).all()/.get()/.run() shape
// used throughout the app, backed by Node's built-in node:sqlite.
function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v;
  }
  return out;
}

const db = {
  prepare(sql) {
    const stmt = raw.prepare(sql);
    return {
      all: (...params) => stmt.all(...params).map(normalizeRow),
      get: (...params) => normalizeRow(stmt.get(...params)),
      run: (...params) => stmt.run(...params),
    };
  },
  exec: (sql) => raw.exec(sql),
};

export default db;
