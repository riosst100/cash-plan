import { useState, useEffect } from "react";
import CurrencyInput from "./CurrencyInput.jsx";

const empty = { name: "", balance: "" };

export default function BalanceForm({ onSubmit, editing, onCancelEdit }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name ?? "", balance: editing.balance ?? "" });
    } else {
      setForm(empty);
    }
  }, [editing?.id]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: form.name, balance: form.balance ? Number(form.balance) : 0 });
      setForm(empty);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h3>{editing ? `Edit Saldo — ${editing.name}` : "Tambah Akun Saldo"}</h3>

      <label>
        Nama Akun
        <input
          type="text"
          placeholder="mis. ATM, Gopay, Cash, E-wallet..."
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
        />
      </label>

      <label>
        Saldo (Rp)
        <CurrencyInput value={form.balance} onChange={(v) => update("balance", v)} />
      </label>

      <div className="full row-actions">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Akun"}
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
