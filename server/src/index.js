import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import db from "./db.js";
import { analyzeDebts } from "./analyzer.js";

const app = express();
app.use(cors());
app.use(express.json());

// ---------- SETTINGS ----------
app.get("/api/settings/:key", (req, res) => {
  const row = db.prepare("SELECT * FROM settings WHERE key = ?").get(req.params.key);
  res.json({ key: req.params.key, value: row ? row.value : null });
});

app.put("/api/settings/:key", (req, res) => {
  const { value } = req.body;
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(req.params.key, String(value));
  res.json({ key: req.params.key, value: String(value) });
});

// ---------- SHARED DATE HELPERS ----------
function formatDateLocal(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isWeekend(date) {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

// Menghitung tanggal jatuh tempo hutang berdasarkan aturan platform:
// - fixed_day: selalu tanggal tetap (mis. tanggal 25) di bulan berikutnya dari tanggal pengajuan
// - follow_transaction_date: sebulan setelah tanggal pengajuan, tanggal yang sama
function computeDueDate(platformRow, transactionDateStr) {
  const txDate = transactionDateStr ? new Date(transactionDateStr) : new Date();
  const nextMonth = new Date(txDate.getFullYear(), txDate.getMonth() + 1, 1);
  const lastDayNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();

  if (platformRow?.due_date_type === "fixed_day" && platformRow.due_day) {
    const day = Math.min(platformRow.due_day, lastDayNextMonth);
    return formatDateLocal(nextMonth.getFullYear(), nextMonth.getMonth(), day);
  }

  // follow_transaction_date (default jika tidak ada aturan platform)
  const day = Math.min(txDate.getDate(), lastDayNextMonth);
  return formatDateLocal(nextMonth.getFullYear(), nextMonth.getMonth(), day);
}

// ---------- PLATFORMS ----------
function serializeRow(row) {
  if (!row) return row;
  return { ...row, tenors: row.tenors ? JSON.parse(row.tenors) : [] };
}

// Bunga efektif suatu hutang: bunga tunggal platform, kecuali kasus khusus
// paylater dengan tenor 1 bulan yang selalu dianggap 0%.
function resolveInterestRate(platformRow, tenorMonths) {
  if (!platformRow) return 0;
  if (platformRow.type === "paylater" && Number(tenorMonths) === 1) return 0;
  return platformRow.interest_rate ?? 0;
}

app.get("/api/platforms", (req, res) => {
  res.json(db.prepare("SELECT * FROM platforms ORDER BY name ASC").all().map(serializeRow));
});

app.post("/api/platforms", (req, res) => {
  const { name, type, total_limit, remaining_limit, due_date_type, due_day, interest_rate, interest_period, tenors } = req.body;
  if (!name) return res.status(400).json({ error: "name wajib diisi" });
  const existing = db.prepare("SELECT * FROM platforms WHERE name = ?").get(name);
  if (existing) return res.status(409).json({ error: "Platform dengan nama ini sudah ada" });
  if (due_date_type === "fixed_day" && (!due_day || due_day < 1 || due_day > 31)) {
    return res.status(400).json({ error: "due_day (1-31) wajib diisi untuk jatuh tempo tanggal tetap" });
  }
  const id = nanoid();
  db.prepare(
    `INSERT INTO platforms (id, name, type, total_limit, remaining_limit, due_date_type, due_day, interest_rate, interest_period, tenors) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    type ?? "pinjol",
    total_limit ?? null,
    remaining_limit ?? null,
    due_date_type ?? "fixed_day",
    due_date_type === "fixed_day" ? due_day : null,
    interest_rate ?? 0,
    interest_period ?? "monthly",
    JSON.stringify(Array.isArray(tenors) ? tenors : [])
  );
  res.status(201).json(serializeRow(db.prepare("SELECT * FROM platforms WHERE id = ?").get(id)));
});

app.put("/api/platforms/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM platforms WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const incoming = { ...req.body, tenors: req.body.tenors !== undefined ? JSON.stringify(req.body.tenors) : existing.tenors };
  const merged = { ...existing, ...incoming };
  if (merged.due_date_type === "fixed_day" && (!merged.due_day || merged.due_day < 1 || merged.due_day > 31)) {
    return res.status(400).json({ error: "due_day (1-31) wajib diisi untuk jatuh tempo tanggal tetap" });
  }
  const duplicate = db.prepare("SELECT * FROM platforms WHERE name = ? AND id != ?").get(merged.name, req.params.id);
  if (duplicate) return res.status(409).json({ error: "Platform dengan nama ini sudah ada" });

  db.prepare(
    `UPDATE platforms SET name=?, type=?, total_limit=?, remaining_limit=?, due_date_type=?, due_day=?, interest_rate=?, interest_period=?, tenors=? WHERE id=?`
  ).run(
    merged.name,
    merged.type,
    merged.total_limit,
    merged.remaining_limit,
    merged.due_date_type,
    merged.due_date_type === "fixed_day" ? merged.due_day : null,
    merged.interest_rate,
    merged.interest_period,
    merged.tenors,
    req.params.id
  );
  res.json(serializeRow(db.prepare("SELECT * FROM platforms WHERE id = ?").get(req.params.id)));
});

app.delete("/api/platforms/:id", (req, res) => {
  db.prepare("DELETE FROM platforms WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- DEBT INSTALLMENTS (cicilan per bulan) ----------
// due_date tersimpan = jatuh tempo cicilan PERTAMA (1 bulan setelah tanggal pengajuan).
// Cicilan berikutnya maju tiap bulan dari situ sampai tenor selesai.
function generateInstallments(debt) {
  if (!debt.tenor_months || !debt.min_payment) return [];
  const tenor = debt.tenor_months;
  const [dy, dm, dd] = debt.due_date.split("-").map(Number);
  const firstDue = new Date(dy, dm - 1, dd);

  const rows = [];
  for (let i = 1; i <= tenor; i++) {
    const targetMonth = firstDue.getMonth() + (i - 1);
    const d = new Date(firstDue.getFullYear(), targetMonth, 1);
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const day = Math.min(firstDue.getDate(), lastDayOfMonth);
    rows.push({
      id: `${debt.id}-m${i}`,
      debt_id: debt.id,
      month_number: i,
      due_date: formatDateLocal(d.getFullYear(), d.getMonth(), day),
      amount: debt.min_payment,
    });
  }
  return rows;
}

function insertInstallments(debt) {
  const rows = generateInstallments(debt);
  const insert = db.prepare(
    `INSERT INTO debt_installments (id, debt_id, month_number, due_date, amount) VALUES (?, ?, ?, ?, ?)`
  );
  for (const row of rows) {
    insert.run(row.id, row.debt_id, row.month_number, row.due_date, row.amount);
  }
}

// Sinkronkan status hutang: 'paid' otomatis jika semua cicilannya sudah lunas
// (atau, untuk hutang tanpa tenor/cicilan, tetap dikelola manual).
function syncDebtStatus(debtId) {
  const installments = db.prepare("SELECT * FROM debt_installments WHERE debt_id = ?").all(debtId);
  if (installments.length === 0) return;
  const allPaid = installments.every((i) => i.status === "paid");
  db.prepare("UPDATE debts SET status = ? WHERE id = ?").run(allPaid ? "paid" : "active", debtId);
}

app.get("/api/debts/:id/installments", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM debt_installments WHERE debt_id = ? ORDER BY month_number ASC")
    .all(req.params.id);
  res.json(rows);
});

app.patch("/api/debts/:debtId/installments/:installmentId", (req, res) => {
  const { status } = req.body;
  if (!["paid", "unpaid"].includes(status)) {
    return res.status(400).json({ error: "status harus 'paid' atau 'unpaid'" });
  }
  db.prepare("UPDATE debt_installments SET status = ? WHERE id = ? AND debt_id = ?").run(
    status,
    req.params.installmentId,
    req.params.debtId
  );
  syncDebtStatus(req.params.debtId);
  res.json(db.prepare("SELECT * FROM debt_installments WHERE id = ?").get(req.params.installmentId));
});

// ---------- DEBTS ----------
function attachInstallmentSummary(rows) {
  const summaryStmt = db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) as unpaid
     FROM debt_installments WHERE debt_id = ?`
  );
  return rows.map((row) => {
    const summary = summaryStmt.get(row.id);
    return {
      ...row,
      total_installments: summary.total || 0,
      unpaid_installments: summary.unpaid || 0,
    };
  });
}

app.get("/api/debts", (req, res) => {
  const rows =
    req.query.status === "all"
      ? db.prepare("SELECT * FROM debts ORDER BY due_date ASC").all()
      : db.prepare("SELECT * FROM debts WHERE status = 'active' ORDER BY due_date ASC").all();
  res.json(attachInstallmentSummary(rows));
});

app.patch("/api/debts/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["active", "paid"].includes(status)) {
    return res.status(400).json({ error: "status harus 'active' atau 'paid'" });
  }
  // Untuk hutang bertenor (punya cicilan), status hanya boleh diubah lewat menandai tiap cicilan,
  // supaya konsisten dengan rincian per-bulan.
  const hasInstallments = db.prepare("SELECT COUNT(*) as c FROM debt_installments WHERE debt_id = ?").get(req.params.id).c > 0;
  if (hasInstallments) {
    return res.status(400).json({ error: "Hutang ini punya cicilan bertenor — tandai lunas per cicilan di Detail Cicilan" });
  }
  db.prepare("UPDATE debts SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json(db.prepare("SELECT * FROM debts WHERE id = ?").get(req.params.id));
});

app.post("/api/debts", (req, res) => {
  const { type, platform, outstanding, principal, min_payment, due_date, transaction_date, tenor_months, notes } = req.body;
  if (!type || !platform || outstanding == null) {
    return res.status(400).json({ error: "type, platform, outstanding wajib diisi" });
  }

  const platformRow = db.prepare("SELECT * FROM platforms WHERE name = ?").get(platform);
  const finalDueDate = due_date || computeDueDate(platformRow, transaction_date);
  const resolvedRate = resolveInterestRate(platformRow, tenor_months);

  const id = nanoid();
  db.prepare(
    `INSERT INTO debts (id, type, platform, outstanding, limit_amount, remaining_limit, interest_rate, interest_period, min_payment, due_date, notes, tenor_months, transaction_date, principal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    type,
    platform,
    outstanding,
    platformRow?.total_limit ?? null,
    platformRow?.remaining_limit ?? null,
    resolvedRate,
    platformRow?.interest_period ?? "monthly",
    min_payment ?? null,
    finalDueDate,
    notes ?? null,
    tenor_months ?? null,
    transaction_date ?? null,
    principal ?? null
  );

  const created = db.prepare("SELECT * FROM debts WHERE id = ?").get(id);
  if (created.tenor_months > 1) {
    insertInstallments(created);
  }
  res.status(201).json(created);
});

app.put("/api/debts/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM debts WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const merged = { ...existing, ...req.body };

  const platformRow = db.prepare("SELECT * FROM platforms WHERE name = ?").get(merged.platform);
  const finalDueDate =
    req.body.due_date ||
    (req.body.transaction_date ? computeDueDate(platformRow, req.body.transaction_date) : existing.due_date);
  const resolvedRate = resolveInterestRate(platformRow, merged.tenor_months);

  db.prepare(
    `UPDATE debts SET type=?, platform=?, outstanding=?, limit_amount=?, remaining_limit=?, interest_rate=?, interest_period=?, min_payment=?, due_date=?, notes=?, tenor_months=?, transaction_date=?, principal=? WHERE id=?`
  ).run(
    merged.type,
    merged.platform,
    merged.outstanding,
    platformRow?.total_limit ?? merged.limit_amount,
    platformRow?.remaining_limit ?? merged.remaining_limit,
    resolvedRate,
    platformRow?.interest_period ?? merged.interest_period,
    merged.min_payment,
    finalDueDate,
    merged.notes,
    merged.tenor_months,
    req.body.transaction_date ?? existing.transaction_date,
    req.body.principal ?? existing.principal,
    req.params.id
  );

  // Jika ada perubahan yang memengaruhi jadwal cicilan (tenor/cicilan/jatuh tempo) dan belum ada
  // cicilan yang dibayar, regenerate ulang jadwal supaya tetap konsisten.
  const scheduleChanged =
    merged.tenor_months !== existing.tenor_months ||
    merged.min_payment !== existing.min_payment ||
    finalDueDate !== existing.due_date;
  if (scheduleChanged) {
    const existingInstallments = db.prepare("SELECT * FROM debt_installments WHERE debt_id = ?").all(req.params.id);
    const anyPaid = existingInstallments.some((i) => i.status === "paid");
    if (!anyPaid) {
      db.prepare("DELETE FROM debt_installments WHERE debt_id = ?").run(req.params.id);
      const updated = db.prepare("SELECT * FROM debts WHERE id = ?").get(req.params.id);
      if (updated.tenor_months > 1) {
        insertInstallments(updated);
      }
    }
  }

  res.json(db.prepare("SELECT * FROM debts WHERE id = ?").get(req.params.id));
});

app.delete("/api/debts/:id", (req, res) => {
  db.prepare("DELETE FROM debts WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

const HISTORY_MONTHS = 12;

// ---------- EXPENSE RULES (pengeluaran, termasuk berulang) ----------
const AVG_WEEKDAYS_PER_MONTH = 21.7; // ~5/7 hari dalam sebulan, dipakai analyzer untuk estimasi bulanan

function generateExpenseHistory(rule) {
  const today = new Date();
  const rows = [];

  if (rule.recurrence === "once") {
    rows.push({ id: nanoid(), rule_id: rule.id, category: rule.category, description: rule.description, amount: rule.amount, expense_date: rule.expense_date });
    return rows;
  }

  if (rule.recurrence === "monthly") {
    for (let m = 0; m < HISTORY_MONTHS; m++) {
      const year = today.getFullYear();
      const month = today.getMonth() + m;
      const d = new Date(year, month, 1);
      const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const day = Math.min(rule.expense_day, lastDayOfMonth);
      const expense_date = formatDateLocal(d.getFullYear(), d.getMonth(), day);
      rows.push({ id: nanoid(), rule_id: rule.id, category: rule.category, description: rule.description, amount: rule.amount, expense_date });
    }
    return rows;
  }

  if (rule.recurrence === "weekday") {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      if (isWeekend(d)) continue;
      const expense_date = formatDateLocal(d.getFullYear(), d.getMonth(), d.getDate());
      rows.push({ id: nanoid(), rule_id: rule.id, category: rule.category, description: rule.description, amount: rule.amount, expense_date });
    }
    return rows;
  }

  return rows;
}

app.get("/api/expenses", (req, res) => {
  res.json(db.prepare("SELECT * FROM expense_rules ORDER BY created_at DESC").all());
});

app.post("/api/expenses", (req, res) => {
  const { category, description, amount, recurrence, expense_day, expense_date } = req.body;
  if (!category || amount == null || !recurrence) {
    return res.status(400).json({ error: "category, amount, recurrence wajib diisi" });
  }
  if (recurrence === "monthly" && !expense_day) {
    return res.status(400).json({ error: "expense_day wajib diisi untuk pengeluaran bulanan" });
  }
  if (recurrence === "once" && !expense_date) {
    return res.status(400).json({ error: "expense_date wajib diisi untuk pengeluaran sekali" });
  }
  if (recurrence === "monthly" && (expense_day < 1 || expense_day > 31)) {
    return res.status(400).json({ error: "expense_day harus antara 1-31" });
  }

  const id = nanoid();
  const rule = {
    id,
    category,
    description: description ?? null,
    amount,
    recurrence,
    expense_day: recurrence === "monthly" ? expense_day : null,
    expense_date: recurrence === "once" ? expense_date : null,
  };
  db.prepare(
    `INSERT INTO expense_rules (id, category, description, amount, recurrence, expense_day, expense_date) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(rule.id, rule.category, rule.description, rule.amount, rule.recurrence, rule.expense_day, rule.expense_date);

  const history = generateExpenseHistory(rule);
  const insertExpense = db.prepare(
    `INSERT INTO expenses (id, rule_id, category, description, amount, expense_date) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const row of history) {
    insertExpense.run(row.id, row.rule_id, row.category, row.description, row.amount, row.expense_date);
  }

  res.status(201).json(db.prepare("SELECT * FROM expense_rules WHERE id = ?").get(id));
});

app.get("/api/expenses/:id/history", (req, res) => {
  const rule = db.prepare("SELECT * FROM expense_rules WHERE id = ?").get(req.params.id);
  if (!rule) return res.status(404).json({ error: "Not found" });
  const history = db
    .prepare("SELECT * FROM expenses WHERE rule_id = ? ORDER BY expense_date ASC")
    .all(req.params.id);
  res.json({ rule, history });
});

app.delete("/api/expenses/:id", (req, res) => {
  db.prepare("DELETE FROM expenses WHERE rule_id = ?").run(req.params.id);
  db.prepare("DELETE FROM expense_rules WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- INCOME RULES (gaji berulang) ----------
function generateIncomeHistory(rule) {
  const today = new Date();
  const rows = [];
  for (let m = 0; m < HISTORY_MONTHS; m++) {
    const year = today.getFullYear();
    const month = today.getMonth() + m;
    const d = new Date(year, month, 1);
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const day = Math.min(rule.income_day, lastDayOfMonth);
    const income_date = formatDateLocal(d.getFullYear(), d.getMonth(), day);
    rows.push({ id: nanoid(), rule_id: rule.id, source: rule.source, amount: rule.amount, income_date });
  }
  return rows;
}

app.get("/api/incomes", (req, res) => {
  res.json(db.prepare("SELECT * FROM income_rules ORDER BY created_at DESC").all());
});

app.post("/api/incomes", (req, res) => {
  const { source, amount, income_day } = req.body;
  if (amount == null || !income_day) {
    return res.status(400).json({ error: "amount, income_day (tanggal gajian 1-31) wajib diisi" });
  }
  if (income_day < 1 || income_day > 31) {
    return res.status(400).json({ error: "income_day harus antara 1-31" });
  }
  const id = nanoid();
  const rule = { id, source: source ?? "Gaji", amount, income_day };
  db.prepare(`INSERT INTO income_rules (id, source, amount, income_day) VALUES (?, ?, ?, ?)`).run(
    id,
    rule.source,
    rule.amount,
    rule.income_day
  );

  const history = generateIncomeHistory(rule);
  const insertIncome = db.prepare(
    `INSERT INTO incomes (id, rule_id, source, amount, income_date) VALUES (?, ?, ?, ?, ?)`
  );
  for (const row of history) {
    insertIncome.run(row.id, row.rule_id, row.source, row.amount, row.income_date);
  }

  res.status(201).json(db.prepare("SELECT * FROM income_rules WHERE id = ?").get(id));
});

app.get("/api/incomes/:id/history", (req, res) => {
  const rule = db.prepare("SELECT * FROM income_rules WHERE id = ?").get(req.params.id);
  if (!rule) return res.status(404).json({ error: "Not found" });
  const history = db
    .prepare("SELECT * FROM incomes WHERE rule_id = ? ORDER BY income_date ASC")
    .all(req.params.id);
  res.json({ rule, history });
});

app.delete("/api/incomes/:id", (req, res) => {
  db.prepare("DELETE FROM incomes WHERE rule_id = ?").run(req.params.id);
  db.prepare("DELETE FROM income_rules WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- ANALYZE ----------
function toMonthlyExpense(rule) {
  if (rule.recurrence === "weekday") {
    return { ...rule, amount: rule.amount * AVG_WEEKDAYS_PER_MONTH };
  }
  if (rule.recurrence === "once") {
    return { ...rule, amount: 0 }; // pengeluaran sekali tidak dihitung sebagai beban bulanan rutin
  }
  return rule; // monthly: amount sudah per bulan
}

// Untuk hutang bertenor, sesuaikan due_date ke cicilan berikutnya yang belum dibayar
// dan outstanding ke sisa tagihan (cicilan tersisa x jumlah cicilan), supaya Analisa
// tidak salah menampilkan cicilan yang sudah lunas sebagai "terlambat".
function adjustForRemainingInstallments(debt) {
  if (!(debt.tenor_months > 1)) return debt;
  const nextUnpaid = db
    .prepare("SELECT * FROM debt_installments WHERE debt_id = ? AND status = 'unpaid' ORDER BY due_date ASC LIMIT 1")
    .get(debt.id);
  if (!nextUnpaid) return debt; // semua cicilan lunas (seharusnya sudah status 'paid')

  const unpaidCount = db
    .prepare("SELECT COUNT(*) as c FROM debt_installments WHERE debt_id = ? AND status = 'unpaid'")
    .get(debt.id).c;

  return {
    ...debt,
    due_date: nextUnpaid.due_date,
    outstanding: unpaidCount * nextUnpaid.amount,
  };
}

app.post("/api/analyze", (req, res) => {
  const allPlatforms = db.prepare("SELECT * FROM platforms").all();
  const platformByName = new Map(allPlatforms.map((p) => [p.name, p]));
  const debts = db.prepare("SELECT * FROM debts WHERE status = 'active'").all().map((d) => {
    const platform = platformByName.get(d.platform);
    const withRate = platform
      ? { ...d, interest_rate: resolveInterestRate(platform, d.tenor_months), interest_period: platform.interest_period }
      : d;
    return adjustForRemainingInstallments(withRate);
  });
  const expenseRules = db.prepare("SELECT * FROM expense_rules").all().map(toMonthlyExpense);
  const incomeRules = db.prepare("SELECT * FROM income_rules").all();
  const primaryIncomeRule = db.prepare("SELECT * FROM income_rules ORDER BY income_day ASC LIMIT 1").get();
  const payday = primaryIncomeRule?.income_day ?? 1;
  const result = analyzeDebts({ debts, expenses: expenseRules, incomes: incomeRules, platforms: allPlatforms, payday });
  res.json(result);
});

// ---------- SUMMARY / TIMELINE ----------
// Gabungkan cicilan hutang (belum lunas) + pemasukan (histori gaji) per tanggal,
// dari hari ini sampai tanggal jatuh tempo hutang paling akhir.
const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function shortDateId(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTH_NAMES_ID[m - 1].slice(0, 3)}`;
}

// Tentukan label & tanggal awal "periode gajian" (dari tanggal gajian sampai sehari sebelum
// gajian berikutnya) yang memuat tanggal tertentu, berdasarkan tanggal gajian (payday, 1-31).
function getPayPeriod(dateStr, payday) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  // Cari tanggal gajian pada bulan yang sama, disesuaikan kalau bulan itu lebih pendek dari payday.
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const paydayThisMonth = new Date(date.getFullYear(), date.getMonth(), Math.min(payday, daysInMonth(date.getFullYear(), date.getMonth())));

  let periodStart;
  if (date.getDate() >= paydayThisMonth.getDate()) {
    periodStart = paydayThisMonth;
  } else {
    const prevMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const paydayPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(payday, daysInMonth(prevMonth.getFullYear(), prevMonth.getMonth())));
    periodStart = paydayPrevMonth;
  }

  const periodEndExclusive = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, periodStart.getDate());
  const periodEnd = new Date(periodEndExclusive);
  periodEnd.setDate(periodEnd.getDate() - 1);

  const startStr = formatDateLocal(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const endStr = formatDateLocal(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());

  return {
    key: startStr,
    label: `${shortDateId(startStr)} - ${shortDateId(endStr)} ${periodEnd.getFullYear()}`,
  };
}

app.get("/api/summary", (req, res) => {
  const today = formatDateLocal(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const balanceSetting = db.prepare("SELECT * FROM settings WHERE key = 'atm_balance'").get();
  const startingBalance = balanceSetting ? Number(balanceSetting.value) || 0 : 0;

  const primaryIncomeRule = db.prepare("SELECT * FROM income_rules ORDER BY income_day ASC LIMIT 1").get();
  const payday = primaryIncomeRule?.income_day ?? 1;

  const activeDebts = db.prepare("SELECT * FROM debts WHERE status = 'active'").all();
  const events = [];

  for (const debt of activeDebts) {
    if (debt.tenor_months > 1) {
      const installments = db
        .prepare("SELECT * FROM debt_installments WHERE debt_id = ? AND status = 'unpaid' AND due_date >= ?")
        .all(debt.id, today);
      for (const inst of installments) {
        events.push({
          type: "debt",
          date: inst.due_date,
          platform: debt.platform,
          amount: inst.amount,
          detail: `Cicilan bulan ke-${inst.month_number}/${debt.tenor_months}`,
        });
      }
    } else if (debt.due_date >= today) {
      events.push({
        type: "debt",
        date: debt.due_date,
        platform: debt.platform,
        amount: debt.min_payment ?? debt.outstanding,
        detail: "Jatuh tempo",
      });
    }
  }

  const incomeRules = db.prepare("SELECT * FROM income_rules").all();
  const maxDebtDate = events.reduce((max, e) => (e.date > max ? e.date : max), today);

  for (const rule of incomeRules) {
    const incomeRows = db
      .prepare("SELECT * FROM incomes WHERE rule_id = ? AND income_date >= ? ORDER BY income_date ASC")
      .all(rule.id, today);
    for (const row of incomeRows) {
      if (row.income_date > maxDebtDate && events.length > 0) break; // batasi sampai hutang terjauh selesai
      events.push({
        type: "income",
        date: row.income_date,
        platform: row.source,
        amount: row.amount,
        detail: "Pemasukan",
      });
    }
  }

  const grouped = {};
  for (const e of events) {
    if (!grouped[e.date]) grouped[e.date] = { date: e.date, income: 0, expense: 0, items: [] };
    if (e.type === "income") grouped[e.date].income += e.amount;
    else grouped[e.date].expense += e.amount;
    grouped[e.date].items.push(e);
  }

  const timeline = Object.values(grouped).sort((a, b) => (a.date < b.date ? -1 : 1));

  // Kelompokkan hari-hari di timeline ke dalam periode gajian (mis. "28 Sep - 27 Okt 2026").
  const periodsMap = new Map();
  for (const day of timeline) {
    const period = getPayPeriod(day.date, payday);
    if (!periodsMap.has(period.key)) {
      periodsMap.set(period.key, { key: period.key, label: period.label, income: 0, expense: 0, days: [] });
    }
    const p = periodsMap.get(period.key);
    p.income += day.income;
    p.expense += day.expense;
    p.days.push(day);
  }
  const periods = [...periodsMap.values()].sort((a, b) => (a.key < b.key ? -1 : 1));

  res.json({ startingBalance, payday, periods });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Cash Plan server running on http://localhost:${PORT}`);
});
