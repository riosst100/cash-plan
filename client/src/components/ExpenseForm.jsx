import { useState, useEffect } from "react";
import CurrencyInput from "./CurrencyInput.jsx";

const empty = { category: "", description: "", amount: "", recurrence: "monthly", expense_date: "", expense_day: "", balance_account_id: "" };

const CATEGORIES = ["Makan", "Transport", "Penitipan Motor", "Ojek Online", "Tagihan Rumah", "Hiburan", "Belanja", "Langganan", "Kesehatan", "Lainnya"];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function ExpenseForm({ onSubmit, balances = [], editing, onCancelEdit }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        category: editing.category ?? "",
        description: editing.description ?? "",
        amount: editing.amount ?? "",
        recurrence: editing.recurrence ?? "monthly",
        expense_date: editing.expense_date ?? "",
        expense_day: editing.expense_day ?? "",
        balance_account_id: editing.balance_account_id ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [editing?.id]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.category || !form.amount) return;
    if (form.recurrence === "monthly" && !form.expense_day) return;
    if (form.recurrence === "once" && !form.expense_date) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        amount: Number(form.amount),
        expense_day: form.recurrence === "monthly" ? Number(form.expense_day) : null,
        expense_date: form.recurrence === "once" ? form.expense_date : null,
        balance_account_id: form.balance_account_id || null,
      });
      setForm(empty);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h3>{editing ? `Edit Pengeluaran — ${editing.category}` : "Tambah Pengeluaran"}</h3>

      <label>
        Kategori
        <select value={form.category} onChange={(e) => update("category", e.target.value)} required>
          <option value="" disabled>Pilih kategori</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label>
        Jumlah per transaksi (Rp)
        <CurrencyInput value={form.amount} onChange={(v) => update("amount", v)} required />
      </label>

      <label>
        Pola Pengulangan
        <select value={form.recurrence} onChange={(e) => update("recurrence", e.target.value)}>
          <option value="monthly">Bulanan (tanggal tetap)</option>
          <option value="weekday">Tiap Hari Kerja (Senin-Jumat)</option>
          <option value="once">Sekali (tidak berulang)</option>
        </select>
      </label>

      {form.recurrence === "monthly" && (
        <label>
          Tanggal (tiap bulan)
          <select value={form.expense_day} onChange={(e) => update("expense_day", e.target.value)} required>
            <option value="" disabled>Pilih tanggal</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>Tanggal {d}</option>
            ))}
          </select>
        </label>
      )}

      {form.recurrence === "weekday" && (
        <p className="muted full">
          Sistem otomatis membuat catatan pengeluaran ini untuk setiap hari kerja (Senin-Jumat) selama 1 tahun ke depan, tidak termasuk Sabtu-Minggu.
        </p>
      )}

      {form.recurrence === "once" && (
        <label>
          Tanggal
          <input type="date" value={form.expense_date} onChange={(e) => update("expense_date", e.target.value)} required />
        </label>
      )}

      {balances.length > 0 && (
        <label>
          Sumber Saldo — opsional
          <select value={form.balance_account_id} onChange={(e) => update("balance_account_id", e.target.value)}>
            <option value="">Tidak ditentukan</option>
            {balances.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="full">
        Deskripsi — opsional
        <input type="text" value={form.description} onChange={(e) => update("description", e.target.value)} />
      </label>

      <div className="full row-actions">
        <button type="submit" disabled={submitting} className="btn-secondary">
          {submitting ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Pengeluaran"}
        </button>
        {editing && (
          <button type="button" className="btn-secondary-sm" onClick={onCancelEdit}>
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
