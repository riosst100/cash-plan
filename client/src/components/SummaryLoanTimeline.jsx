import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";

export default function SummaryLoanTimeline() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSummaryLoan().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="alert-box warn">{error}</p>;
  if (!data) return <p className="muted">Memuat...</p>;

  const { payday, periods, totalOutstanding, totalActiveDebts } = data;

  return (
    <div className="card">
      <h3>Timeline Cicilan Hutang</h3>
      <p className="muted">
        Dikelompokkan per periode gajian (mulai tanggal {payday} tiap bulan), dari hari ini sampai hutang aktif terjauh selesai.
      </p>

      <div className="alert-box info" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>
          Total hutang aktif: <strong>{totalActiveDebts}</strong> · Total sisa tagihan: <strong className="text-bad">{fmt(totalOutstanding)}</strong>
        </p>
      </div>

      {periods.length === 0 ? (
        <p className="empty">Belum ada jadwal cicilan yang tercatat.</p>
      ) : (
        <>
          {periods.map((period) => (
            <div key={period.key} className="summary-period">
              <div className="summary-period-header">
                <span>Periode {period.label}</span>
                <span>
                  Total cicilan periode ini: <strong className="text-bad">{fmt(period.expense)}</strong>
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Rincian</th>
                      <th>Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.days.map((day) => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td>
                          {day.items.map((item, idx) => (
                            <div key={idx} className="muted">
                              {item.platform} — {item.detail}
                              {(item.principal != null || item.transaction_date) && (
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
                        <td className="text-bad">{fmt(day.expense)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
