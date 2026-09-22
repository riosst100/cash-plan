import { useEffect, useState, useCallback } from "react";
import { Pencil, CheckCircle2, RotateCcw, Save, X } from "lucide-react";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";
import { api } from "../api.js";
import CurrencyInput from "./CurrencyInput.jsx";
import { useConfirm } from "../useConfirm.jsx";

export default function InstallmentSubRow({ debt, colSpan, onStatusChanged }) {
  const [installments, setInstallments] = useState(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [showPaid, setShowPaid] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(() => {
    api
      .getDebtInstallments(debt.id)
      .then(setInstallments)
      .catch((err) => setError(err.message));
  }, [debt.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(installment) {
    const markingPaid = installment.status !== "paid";
    if (markingPaid) {
      const ok = await confirm({
        title: "Tandai cicilan lunas?",
        message: `Cicilan bulan ke-${installment.month_number} (${fmt(installment.amount)}) akan ditandai sudah lunas.`,
        confirmLabel: "Ya, Tandai Lunas",
      });
      if (!ok) return;
    }
    const nextStatus = installment.status === "paid" ? "unpaid" : "paid";
    try {
      await api.updateInstallmentStatus(debt.id, installment.id, nextStatus);
      load();
      onStatusChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(installment) {
    setEditingId(installment.id);
    setEditAmount(String(installment.amount));
  }

  async function saveEdit(installment) {
    const value = Number(editAmount);
    if (!value || value <= 0) return;
    try {
      await api.updateInstallmentAmount(debt.id, installment.id, value);
      setEditingId(null);
      load();
      onStatusChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  const paidCount = installments?.filter((i) => i.status === "paid").length ?? 0;
  const visibleInstallments = installments?.filter((i) => showPaid || i.status !== "paid") ?? [];

  return (
    <tr className="sub-row">
      <td colSpan={colSpan}>
        <div className="sub-row-content">
          {dialog}
          {error && <p className="alert-box warn">{error}</p>}
          {!installments && !error && <p className="muted">Memuat...</p>}
          {installments && (
            <>
              <p className="muted">
                Dicicil {debt.tenor_months} bulan. Sudah lunas {paidCount}/{installments.length} bulan.
                {" "}Jumlah cicilan bisa diedit per bulan jika berbeda dari hasil kalkulasi otomatis.
              </p>
              {paidCount > 0 && (
                <label className="checkbox-chip" style={{ marginBottom: 10 }}>
                  <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />
                  Tampilkan yang sudah lunas ({paidCount})
                </label>
              )}
              <table className="sub-table">
                <thead>
                  <tr>
                    <th>Bulan ke-</th>
                    <th>Jatuh Tempo</th>
                    <th>Cicilan</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInstallments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">Semua cicilan sudah lunas.</td>
                    </tr>
                  )}
                  {visibleInstallments.map((row) => (
                    <tr key={row.id}>
                      <td>{row.month_number}</td>
                      <td>{formatDate(row.due_date)}</td>
                      <td>
                        {editingId === row.id ? (
                          <div className="row-actions">
                            <CurrencyInput value={editAmount} onChange={setEditAmount} />
                            <button className="btn-success-sm" onClick={() => saveEdit(row)}><Save size={13} /> Simpan</button>
                            <button className="btn-info-sm" onClick={() => setEditingId(null)}><X size={13} /> Batal</button>
                          </div>
                        ) : (
                          <>
                            {fmt(row.amount)}{" "}
                            <button className="btn-edit-sm" onClick={() => startEdit(row)}><Pencil size={13} /> Edit</button>
                          </>
                        )}
                      </td>
                      <td>{row.status === "paid" ? <span className="text-good">Lunas</span> : "Belum"}</td>
                      <td>
                        {row.status === "paid" ? (
                          <button className="btn-info-sm" onClick={() => toggleStatus(row)}><RotateCcw size={13} /> Batalkan</button>
                        ) : (
                          <button className="btn-success-sm" onClick={() => toggleStatus(row)}><CheckCircle2 size={13} /> Tandai Lunas</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
