import { useEffect, useState } from "react";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";

export default function HistoryModal({ title, subtitle, fetcher, dateKey, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="alert-box warn">{error}</p>}

        {data ? (
          <>
            {subtitle && <p className="muted">{subtitle(data)} — {data.history.length} catatan.</p>}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id}>
                      <td>{formatDate(h[dateKey])}</td>
                      <td>{fmt(h.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          !error && <p className="muted">Memuat...</p>
        )}
      </div>
    </div>
  );
}
