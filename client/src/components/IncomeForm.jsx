import { useState, useEffect } from "react";
import CurrencyInput from "./CurrencyInput.jsx";

const empty = { source: "Gaji", amount: "", income_day: "", balance_account_id: "" };

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function IncomeForm({ onSubmit, balances = [], editing, onCancelEdit }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        source: editing.source ?? "Gaji",
        amount: editing.amount ?? "",
        income_day: editing.income_day ?? "",
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
    if (!form.amount || !form.income_day) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        amount: Number(form.amount),
        income_day: Number(form.income_day),
        balance_account_id: form.balance_account_id || null,
      });
      setForm(empty);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h3>{editing ? `Edit Pemasukan — ${editing.source}` : "Tambah Pemasukan / Gaji"}</h3>

      <label>
        Sumber
        <input type="text" value={form.source} onChange={(e) => update("source", e.target.value)} placeholder="mis. Gaji, Bonus, Freelance" />
      </label>

      <label>
        Jumlah (Rp)
        <CurrencyInput value={form.amount} onChange={(v) => update("amount", v)} required />
      </label>

      <label>
        Tanggal Gajian (tiap bulan)
        <select value={form.income_day} onChange={(e) => update("income_day", e.target.value)} required>
          <option value="" disabled>Pilih tanggal</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>Tanggal {d}</option>
          ))}
        </select>
      </label>

      {balances.length > 0 && (
        <label>
          Masuk ke Saldo — opsional
          <select value={form.balance_account_id} onChange={(e) => update("balance_account_id", e.target.value)}>
            <option value="">Tidak ditentukan</option>
            {balances.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}

      <p className="muted full">Gaji dianggap selalu berulang tiap bulan pada tanggal ini.</p>

      <div className="full row-actions">
        <button type="submit" disabled={submitting} className="btn-secondary">
          {submitting ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Pemasukan"}
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
