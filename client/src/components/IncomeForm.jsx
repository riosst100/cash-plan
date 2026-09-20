import { useState } from "react";
import CurrencyInput from "./CurrencyInput.jsx";

const empty = { source: "Gaji", amount: "", income_day: "" };

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function IncomeForm({ onSubmit }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || !form.income_day) return;
    setSubmitting(true);
    try {
      await onSubmit({ ...form, amount: Number(form.amount), income_day: Number(form.income_day) });
      setForm(empty);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h3>Tambah Pemasukan / Gaji</h3>

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

      <p className="muted full">Gaji dianggap selalu berulang tiap bulan pada tanggal ini.</p>

      <button type="submit" disabled={submitting} className="full btn-secondary">
        {submitting ? "Menyimpan..." : "Tambah Pemasukan"}
      </button>
    </form>
  );
}
