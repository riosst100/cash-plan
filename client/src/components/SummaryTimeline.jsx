import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";

export default function SummaryTimeline() {
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSummary().then(setTimeline).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="alert-box warn">{error}</p>;
  if (!timeline) return <p className="muted">Memuat...</p>;
  if (timeline.length === 0) return <p className="empty">Belum ada jadwal cicilan atau pemasukan yang tercatat.</p>;

  let runningBalance = 0;

  return (
    <div className="card">
      <h3>Timeline Kas — Hutang & Pemasukan</h3>
      <p className="muted">Urutan tanggal dari hari ini sampai hutang aktif terjauh selesai.</p>
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
            {timeline.map((day) => {
              runningBalance += day.income - day.expense;
              return (
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
                  <td className={runningBalance < 0 ? "text-bad" : "text-good"}>{fmt(runningBalance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
