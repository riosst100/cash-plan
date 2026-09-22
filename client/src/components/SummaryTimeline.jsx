import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";

const UNASSIGNED_KEY = "unassigned";

export default function SummaryTimeline() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  function load() {
    api.getSummary().then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="alert-box warn">{error}</p>;
  if (!data) return <p className="muted">Memuat...</p>;

  const { startingBalance, payday, periods, balanceAccounts } = data;

  // Saldo berjalan dihitung terpisah per akun. Transaksi tanpa balance_account_id
  // masuk ke kolom "Belum Ditentukan" sendiri, supaya tidak mengacaukan saldo akun yang jelas sumbernya.
  const accountKeys = [...balanceAccounts.map((a) => a.id), UNASSIGNED_KEY];
  const accountLabel = (key) =>
    key === UNASSIGNED_KEY ? "Belum Ditentukan" : balanceAccounts.find((a) => a.id === key)?.name ?? "?";

  const runningByAccount = {};
  for (const acc of balanceAccounts) runningByAccount[acc.id] = acc.balance || 0;
  runningByAccount[UNASSIGNED_KEY] = 0;

  return (
    <div className="card">
      <h3>Timeline Kas — Hutang & Pemasukan</h3>
      <p className="muted">
        Dikelompokkan per periode gajian (mulai tanggal {payday} tiap bulan), dari hari ini sampai hutang aktif terjauh selesai.
      </p>

      <div className="alert-box info" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>
          Saldo saat ini (total dari {balanceAccounts.length} akun): <strong className={startingBalance < 0 ? "text-bad" : "text-good"}>{fmt(startingBalance)}</strong>
        </p>
        {balanceAccounts.length > 0 && (
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {balanceAccounts.map((b) => `${b.name}: ${fmt(b.balance)}`).join(" · ")}
          </p>
        )}
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Kelola akun saldo di tab <Link to="/saldo">Saldo</Link>.
        </p>
      </div>

      {periods.length === 0 ? (
        <p className="empty">Belum ada jadwal cicilan atau pemasukan yang tercatat.</p>
      ) : (
        <>
          {periods.map((period) => {
            const periodRows = period.days.map((day) => {
              for (const item of day.items) {
                const key = item.balance_account_id ?? UNASSIGNED_KEY;
                const signedAmount = item.type === "income" ? item.amount : -item.amount;
                runningByAccount[key] = (runningByAccount[key] || 0) + signedAmount;
              }
              return { day, balanceSnapshot: { ...runningByAccount } };
            });
            const periodEndSnapshot = periodRows.length > 0 ? periodRows[periodRows.length - 1].balanceSnapshot : runningByAccount;
            const periodEndTotal = accountKeys.reduce((s, k) => s + (periodEndSnapshot[k] || 0), 0);

            return (
              <div key={period.key} className="summary-period">
                <div className="summary-period-header">
                  <span>Periode {period.label}</span>
                  <span>
                    Masuk {fmt(period.income)} · Keluar {fmt(period.expense)} · Total saldo akhir periode{" "}
                    <strong className={periodEndTotal < 0 ? "text-bad" : "text-good"}>{fmt(periodEndTotal)}</strong>
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th>Rincian</th>
                        <th>Pemasukan</th>
                        <th>Pengeluaran</th>
                        {accountKeys.map((key) => (
                          <th key={key}>Saldo {accountLabel(key)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodRows.map(({ day, balanceSnapshot }) => (
                        <tr key={day.date}>
                          <td>{formatDate(day.date)}</td>
                          <td>
                            {day.items.map((item, idx) => (
                              <div key={idx} className="muted">
                                {item.platform} — {item.detail}
                                {item.balance_account_id ? ` (${accountLabel(item.balance_account_id)})` : ""}
                                {item.type === "debt" && (item.principal != null || item.transaction_date) && (
                                  <span>
                                    {" "}
                                    ({item.principal != null && <>Plafon {fmt(item.principal)}</>}
                                    {item.principal != null && item.transaction_date && ", "}
                                    {item.transaction_date && <>Diajukan {formatDate(item.transaction_date)}</>})
                                  </span>
                                )}
                              </div>
                            ))}
                          </td>
                          <td className={day.income > 0 ? "text-good" : ""}>{day.income > 0 ? fmt(day.income) : "-"}</td>
                          <td className={day.expense > 0 ? "text-bad" : ""}>{day.expense > 0 ? fmt(day.expense) : "-"}</td>
                          {accountKeys.map((key) => (
                            <td key={key} className={balanceSnapshot[key] < 0 ? "text-bad" : "text-good"}>
                              {fmt(balanceSnapshot[key] || 0)}
                            </td>
                          ))}
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
