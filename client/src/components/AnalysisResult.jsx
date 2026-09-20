import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatRupiah as fmt } from "../format.js";
import { formatDate } from "../dateFormat.js";

export default function AnalysisResult({ result }) {
  if (!result) return null;
  const { summary, warnings, recommendations, priorityOrder, strategy, monthlyProjection, payoffEstimateMonths, totalInterestProjected, canBorrowMoreSafely, maxSafeNewLoanInstallment } = result;

  return (
    <div className="analysis">
      <h2>Hasil Analisis</h2>

      <div className="summary-grid">
        <SummaryCard label="Total Pemasukan/bln" value={fmt(summary.totalIncome)} tone="good" />
        <SummaryCard label="Total Pengeluaran/bln" value={fmt(summary.totalExpense)} tone="neutral" />
        <SummaryCard label="Total Hutang" value={fmt(summary.totalOutstanding)} tone="bad" />
        <SummaryCard label="Cicilan Minimum/bln" value={fmt(summary.totalMinPayments)} tone="neutral" />
        <SummaryCard
          label="Dana Bebas/bln"
          value={fmt(summary.freeCashFlow)}
          tone={summary.freeCashFlow >= 0 ? "good" : "bad"}
        />
        <SummaryCard
          label="Rasio Hutang / Gaji"
          value={Number.isFinite(summary.debtToIncomeRatio) ? `${summary.debtToIncomeRatio}x` : "∞"}
          tone={summary.debtToIncomeRatio > 3 ? "bad" : "good"}
        />
      </div>

      {warnings.length > 0 && (
        <div className="alert-box warn">
          <h4>⚠️ Peringatan</h4>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="alert-box info">
        <h4>💡 Rekomendasi & Strategi ({strategy === "avalanche" ? "Avalanche — bunga tertinggi dulu" : "Snowball — nominal terkecil dulu"})</h4>
        <ul>
          {recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="grid-2">
        <div className="card">
          <h4>Estimasi Waktu Bebas Hutang</h4>
          <p className="big-stat">{payoffEstimateMonths} bulan</p>
          <p className="muted">≈ {(payoffEstimateMonths / 12).toFixed(1)} tahun. Total estimasi bunga yang akan dibayar: {fmt(totalInterestProjected)}</p>
        </div>
        <div className="card">
          <h4>Boleh Pinjam Lagi?</h4>
          <p className={`big-stat ${canBorrowMoreSafely ? "text-good" : "text-bad"}`}>
            {canBorrowMoreSafely ? "Boleh, untuk konsolidasi" : "Sebaiknya Tidak Dulu"}
          </p>
          {canBorrowMoreSafely && (
            <p className="muted">Maks. cicilan baru yang aman: {fmt(maxSafeNewLoanInstallment)}/bulan, hanya untuk melunasi hutang bunga tinggi.</p>
          )}
        </div>
      </div>

      {priorityOrder.length > 0 && (
        <div className="card">
          <h4>Urutan Prioritas Pelunasan</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Platform</th>
                  <th>Tagihan</th>
                  <th>Bunga/bln</th>
                  <th>Jatuh Tempo</th>
                  <th>Alasan</th>
                </tr>
              </thead>
              <tbody>
                {priorityOrder.map((p) => (
                  <tr key={p.id}>
                    <td>{p.rank}</td>
                    <td>{p.platform}</td>
                    <td>{fmt(p.outstanding)}</td>
                    <td>{p.rate_monthly_pct}%</td>
                    <td>
                      {formatDate(p.due_date)} ({p.days_until_due >= 0 ? `${p.days_until_due} hari lagi` : "TERLAMBAT"})
                    </td>
                    <td>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {monthlyProjection.length > 0 && (
        <div className="card">
          <h4>Proyeksi Sisa Total Hutang per Bulan</h4>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthlyProjection}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" label={{ value: "Bulan ke-", position: "insideBottom", offset: -5 }} />
              <YAxis tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(l) => `Bulan ke-${l}`} />
              <Legend />
              <Line type="monotone" dataKey="totalBalance" name="Sisa Hutang" stroke="#e0245e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className={`summary-card tone-${tone}`}>
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
    </div>
  );
}
