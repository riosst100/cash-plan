import { useState, useEffect } from "react";
import CurrencyInput from "./CurrencyInput.jsx";

const empty = {
  name: "",
  type: "pinjol",
  total_limit: "",
  remaining_limit: "",
  due_date_type: "fixed_day",
  due_day: "",
  interest_rate: "",
  interest_period: "monthly",
  tenors: [],
};

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const TENOR_OPTIONS = [1, 2, 3, 6, 9, 12, 18, 24];

export default function PlatformForm({ onSubmit, editing, onCancelEdit }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? "",
        type: editing.type ?? "pinjol",
        total_limit: editing.total_limit ?? "",
        remaining_limit: editing.remaining_limit ?? "",
        due_date_type: editing.due_date_type ?? "fixed_day",
        due_day: editing.due_day ?? "",
        interest_rate: editing.interest_rate ?? "",
        interest_period: editing.interest_period ?? "monthly",
        tenors: editing.tenors ?? [],
      });
    } else {
      setForm(empty);
    }
  }, [editing]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleTenor(month) {
    setForm((f) => ({
      ...f,
      tenors: f.tenors.includes(month) ? f.tenors.filter((t) => t !== month) : [...f.tenors, month].sort((a, b) => a - b),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) return;
    if (form.due_date_type === "fixed_day" && !form.due_day) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        total_limit: form.total_limit ? Number(form.total_limit) : null,
        remaining_limit: form.remaining_limit ? Number(form.remaining_limit) : null,
        due_day: form.due_date_type === "fixed_day" ? Number(form.due_day) : null,
        interest_rate: form.interest_rate ? Number(form.interest_rate) : 0,
      });
      setForm(empty);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h3>{editing ? `Edit Platform — ${editing.name}` : "Tambah Platform Pinjol / Paylater"}</h3>

      <label>
        Nama Platform
        <input
          type="text"
          placeholder="mis. Kredivo, Shopee PayLater, Akulaku..."
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
        />
      </label>

      <label>
        Jenis
        <select value={form.type} onChange={(e) => update("type", e.target.value)}>
          <option value="pinjol">Pinjaman Online (Pinjol)</option>
          <option value="paylater">Paylater</option>
          <option value="lainnya">Lainnya</option>
        </select>
      </label>

      <label>
        Total Limit (Rp) — plafon maksimal dari platform
        <CurrencyInput value={form.total_limit} onChange={(v) => update("total_limit", v)} />
      </label>

      <label>
        Sisa Limit (Rp) — jumlah yang masih bisa dipinjam
        <CurrencyInput value={form.remaining_limit} onChange={(v) => update("remaining_limit", v)} />
      </label>

      <label>
        Bunga (%)
        <input type="number" min="0" step="0.01" value={form.interest_rate} onChange={(e) => update("interest_rate", e.target.value)} />
      </label>

      <label>
        Periode Bunga
        <select value={form.interest_period} onChange={(e) => update("interest_period", e.target.value)}>
          <option value="monthly">Per Bulan</option>
          <option value="yearly">Per Tahun</option>
          <option value="daily">Per Hari</option>
        </select>
      </label>

      <label>
        Pola Jatuh Tempo
        <select value={form.due_date_type} onChange={(e) => update("due_date_type", e.target.value)}>
          <option value="fixed_day">Tanggal Tetap (mis. selalu tgl 25)</option>
          <option value="follow_transaction_date">Mengikuti Tanggal Pengajuan</option>
        </select>
      </label>

      {form.due_date_type === "fixed_day" ? (
        <label>
          Jatuh Tempo Setiap Tanggal
          <select value={form.due_day} onChange={(e) => update("due_day", e.target.value)} required>
            <option value="" disabled>Pilih tanggal</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>Tanggal {d}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted full">
          Jatuh tempo otomatis dihitung 1 bulan setelah tanggal pengajuan hutang (mis. pinjam tgl 10, jatuh tempo tgl 10 bulan berikutnya).
        </p>
      )}

      <div className="full">
        <span className="field-label">Tenor Tersedia (bulan)</span>
        <div className="checkbox-row">
          {TENOR_OPTIONS.map((m) => (
            <label key={m} className="checkbox-chip">
              <input type="checkbox" checked={form.tenors.includes(m)} onChange={() => toggleTenor(m)} />
              {m} bln
            </label>
          ))}
        </div>
        {form.type === "paylater" && form.tenors.includes(1) && (
          <p className="muted" style={{ marginTop: 8 }}>
            Catatan: tenor 1 bulan untuk Paylater otomatis dianggap bunga 0%, terlepas dari nilai Bunga (%) di atas.
          </p>
        )}
      </div>

      <div className="full row-actions">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Platform"}
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
