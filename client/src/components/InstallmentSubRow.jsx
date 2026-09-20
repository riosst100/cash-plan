import { useEffect, useState, useCallback } from "react";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";
import { api } from "../api.js";

export default function InstallmentSubRow({ debt, colSpan, onStatusChanged }) {
  const [installments, setInstallments] = useState(null);
  const [error, setError] = useState("");

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
    const nextStatus = installment.status === "paid" ? "unpaid" : "paid";
    try {
      await api.updateInstallmentStatus(debt.id, installment.id, nextStatus);
      load();
      onStatusChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  const paidCount = installments?.filter((i) => i.status === "paid").length ?? 0;

  return (
    <tr className="sub-row">
      <td colSpan={colSpan}>
        <div className="sub-row-content">
          {error && <p className="alert-box warn">{error}</p>}
          {!installments && !error && <p className="muted">Memuat...</p>}
          {installments && (
            <>
              <p className="muted">
                Dicicil {debt.tenor_months} bulan, {fmt(debt.min_payment)}/bulan. Sudah lunas {paidCount}/{installments.length} bulan.
              </p>
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
                  {installments.map((row) => (
                    <tr key={row.id}>
                      <td>{row.month_number}</td>
                      <td>{formatDate(row.due_date)}</td>
                      <td>{fmt(row.amount)}</td>
                      <td>{row.status === "paid" ? <span className="text-good">Lunas</span> : "Belum"}</td>
                      <td>
                        <button className="btn-secondary-sm" onClick={() => toggleStatus(row)}>
                          {row.status === "paid" ? "Batalkan" : "Tandai Lunas"}
                        </button>
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
