import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";
import CurrencyInput from "./CurrencyInput.jsx";

export default function SummaryTimeline() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [balanceInput, setBalanceInput] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  function load() {
    api.getSummary().then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (data) setBalanceInput(data.startingBalance ? String(data.startingBalance) : "");
  }, [data?.startingBalance]);

  async function saveBalance() {
    setSavingBalance(true);
    try {
      await api.setSetting("atm_balance", balanceInput || "0");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBalance(false);
    }
  }

  if (error) return <p className="alert-box warn">{error}</p>;
  if (!data) return <p className="muted">Memuat...</p>;

  const { startingBalance, payday, periods } = data;
  let runningBalance = startingBalance || 0;

  return (
    <div className="card">
      <h3>Timeline Kas — Hutang & Pemasukan</h3>
      <p className="muted">
        Dikelompokkan per periode gajian (mulai tanggal {payday} tiap bulan), dari hari ini sampai hutang aktif terjauh selesai.
      </p>

      <div className="form-grid" style={{ marginBottom: 16 }}>
        <label>
          Saldo ATM Saat Ini (Rp)
          <CurrencyInput value={balanceInput} onChange={setBalanceInput} />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="btn-secondary" onClick={saveBalance} disabled={savingBalance}>
            {savingBalance ? "Menyimpan..." : "Simpan Saldo"}
          </button>
        </div>
      </div>

      {periods.length === 0 ? (
        <p className="empty">Belum ada jadwal cicilan atau pemasukan yang tercatat.</p>
      ) : (
        <>
          <p className="muted">
            Saldo ATM saat ini: <strong className={runningBalance < 0 ? "text-bad" : "text-good"}>{fmt(runningBalance)}</strong>
          </p>
          {periods.map((period) => {
            const periodRows = period.days.map((day) => {
              runningBalance += day.income - day.expense;
              return { day, balanceAfter: runningBalance };
            });
            const periodEndBalance = runningBalance;

            return (
              <div key={period.key} className="summary-period">
                <div className="summary-period-header">
                  <span>Periode {period.label}</span>
                  <span>
                    Masuk {fmt(period.income)} · Keluar {fmt(period.expense)} · Saldo akhir periode{" "}
                    <strong className={periodEndBalance < 0 ? "text-bad" : "text-good"}>{fmt(periodEndBalance)}</strong>
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th>Rincian</th>
                        <th>Pemasukan</th>
                        <th>Pengeluaran (Cicilan)</th>
                        <th>Saldo Berjalan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodRows.map(({ day, balanceAfter }) => (
                        <tr key={day.date}>
                          <td>{formatDate(day.date)}</td>
                          <td>
                            {day.items.map((item, idx) => (
                              <div key={idx} className="muted">
                                {item.platform} — {item.detail}
                              </div>
                            ))}
                          </td>
                          <td className={day.income > 0 ? "text-good" : ""}>{day.income > 0 ? fmt(day.income) : "-"}</td>
                          <td className={day.expense > 0 ? "text-bad" : ""}>{day.expense > 0 ? fmt(day.expense) : "-"}</td>
                          <td className={balanceAfter < 0 ? "text-bad" : "text-good"}>{fmt(balanceAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
