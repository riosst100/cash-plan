import { useState, Fragment } from "react";
import { Pencil, Trash2, CheckCircle2, RotateCcw, ListTree, History } from "lucide-react";
import { formatRupiah as fmt } from "../format.js";
import { formatDate, formatDayOnly } from "../dateFormat.js";
import InstallmentSubRow from "./InstallmentSubRow.jsx";

const PERIOD_LABEL = { monthly: "bln", yearly: "thn", daily: "hari" };

export function BalanceList({ balances, onEdit, onDelete }) {
  if (balances.length === 0) return <p className="empty">Belum ada akun saldo. Tambahkan (mis. ATM, Gopay, Cash) untuk mulai tracking.</p>;
  const total = balances.reduce((s, b) => s + (b.balance || 0), 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nama Akun</th>
            <th>Saldo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>{fmt(b.balance)}</td>
              <td className="row-actions">
                <button className="btn-edit-sm" onClick={() => onEdit(b)}><Pencil size={13} /> Edit</button>
                <button className="btn-danger-sm" onClick={() => onDelete(b.id)}><Trash2 size={13} /> Hapus</button>
              </td>
            </tr>
          ))}
          <tr>
            <td><strong>Total</strong></td>
            <td><strong>{fmt(total)}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Plafon diambil langsung dari kolom `principal` yang tersimpan (bukan dihitung balik dari
// outstanding) supaya selalu konsisten dengan angka yang diinput user. Untuk data lama yang
// belum punya principal tersimpan, fallback ke hitung balik dari outstanding (bunga flat).
function splitPrincipalAndInterest(debt, interestRate) {
  if (debt.principal != null) {
    return { principal: debt.principal, totalInterest: debt.outstanding - debt.principal };
  }
  const tenor = debt.tenor_months || 1;
  const rate = (interestRate || 0) / 100;
  const denom = 1 + rate * tenor;
  const principal = denom > 0 ? debt.outstanding / denom : debt.outstanding;
  const totalInterest = debt.outstanding - principal;
  return { principal, totalInterest };
}

export function PlatformList({ platforms, onDelete, onEdit }) {
  if (platforms.length === 0) return <p className="empty">Belum ada platform. Tambahkan dulu sebelum input hutang.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nama Platform</th>
            <th>Jenis</th>
            <th>Total Limit</th>
            <th>Sisa Limit</th>
            <th>Limit Terpakai</th>
            <th>Bunga</th>
            <th>Tenor</th>
            <th>Jatuh Tempo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((p) => {
            const used = p.total_limit != null && p.remaining_limit != null ? p.total_limit - p.remaining_limit : null;
            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="capitalize">{p.type}</td>
                <td>{p.total_limit != null ? fmt(p.total_limit) : "-"}</td>
                <td>{p.remaining_limit != null ? fmt(p.remaining_limit) : "-"}</td>
                <td>{used != null ? fmt(used) : "-"}</td>
                <td>
                  {p.interest_rate}% / {PERIOD_LABEL[p.interest_period] ?? p.interest_period}
                  {p.type === "paylater" && p.tenors?.includes(1) ? " (tenor 1bln: 0%)" : ""}
                </td>
                <td>{p.tenors && p.tenors.length > 0 ? p.tenors.map((t) => `${t} bln`).join(", ") : "-"}</td>
                <td>
                  {p.due_date_type === "fixed_day"
                    ? `Tgl ${p.due_day} (tetap)`
                    : "Ikut tgl pengajuan"}
                </td>
                <td className="row-actions">
                  <button className="btn-edit-sm" onClick={() => onEdit(p)}><Pencil size={13} /> Edit</button>
                  <button className="btn-danger-sm" onClick={() => onDelete(p.id)}><Trash2 size={13} /> Hapus</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DebtList({ debts, platforms, onDelete, onEdit, onMarkPaid, onMarkActive, onInstallmentChanged }) {
  const [expandedId, setExpandedId] = useState(null);
  if (debts.length === 0) return <p className="empty">Belum ada data hutang.</p>;
  const colSpan = 12;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Jenis</th>
            <th>Plafon</th>
            <th>Total Bunga</th>
            <th>Total Tagihan</th>
            <th>Bunga</th>
            <th>Tenor</th>
            <th>Sisa Cicilan</th>
            <th>Cicilan/bln</th>
            <th>Tgl Pengajuan</th>
            <th>Jatuh Tempo</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {debts.map((d) => {
            const platform = platforms?.find((p) => p.name === d.platform);
            const isZeroPaylater = platform?.type === "paylater" && Number(d.tenor_months) === 1;
            const interestRate = isZeroPaylater ? 0 : platform?.interest_rate ?? d.interest_rate;
            const interestPeriod = platform?.interest_period ?? d.interest_period;
            const isPaid = d.status === "paid";
            const hasSchedule = d.tenor_months > 1 && d.min_payment;
            const isExpanded = expandedId === d.id;
            const { principal, totalInterest } = splitPrincipalAndInterest(d, interestRate);
            return (
              <Fragment key={d.id}>
                <tr>
                  <td>{d.platform}</td>
                  <td className="capitalize">{d.type}</td>
                  <td>{fmt(principal)}</td>
                  <td>{fmt(totalInterest)}</td>
                  <td>{fmt(d.outstanding)}</td>
                  <td>
                    {interestRate}% / {PERIOD_LABEL[interestPeriod] ?? interestPeriod}
                  </td>
                  <td>{d.tenor_months ? `${d.tenor_months} bln` : "-"}</td>
                  <td>
                    {hasSchedule ? `${d.unpaid_installments} bulan` : "-"}
                  </td>
                  <td>{d.min_payment ? fmt(d.min_payment) : "-"}</td>
                  <td>{formatDate(d.transaction_date)}</td>
                  <td>{formatDayOnly(d.due_date)}</td>
                  <td>{isPaid ? <span className="text-good">Lunas</span> : "Aktif"}</td>
                  <td className="row-actions">
                    {hasSchedule ? (
                      <button className="btn-info-sm" onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                        <ListTree size={13} /> {isExpanded ? "Tutup Cicilan" : "Detail Cicilan"}
                      </button>
                    ) : isPaid ? (
                      <button className="btn-info-sm" onClick={() => onMarkActive(d.id)}><RotateCcw size={13} /> Aktifkan Lagi</button>
                    ) : (
                      <button className="btn-success-sm" onClick={() => onMarkPaid(d.id)}><CheckCircle2 size={13} /> Tandai Lunas</button>
                    )}
                    <button className="btn-edit-sm" onClick={() => onEdit(d)}><Pencil size={13} /> Edit</button>
                    <button className="btn-danger-sm" onClick={() => onDelete(d.id)}><Trash2 size={13} /> Hapus</button>
                  </td>
                </tr>
                {hasSchedule && isExpanded && (
                  <InstallmentSubRow debt={d} colSpan={colSpan} onStatusChanged={onInstallmentChanged} />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const RECURRENCE_LABEL = {
  monthly: (e) => `Tgl ${e.expense_day} (tiap bulan)`,
  weekday: () => "Tiap hari kerja (Sen-Jum)",
  once: (e) => formatDate(e.expense_date),
};

export function ExpenseList({ expenses, balances = [], onDelete, onEdit, onViewHistory }) {
  if (expenses.length === 0) return <p className="empty">Belum ada data pengeluaran.</p>;
  const accountName = (id) => balances.find((b) => b.id === id)?.name ?? "-";
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kategori</th>
            <th>Deskripsi</th>
            <th>Jumlah</th>
            <th>Jadwal</th>
            <th>Sumber Saldo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td>{e.category}</td>
              <td>{e.description || "-"}</td>
              <td>{fmt(e.amount)}</td>
              <td>{RECURRENCE_LABEL[e.recurrence]?.(e) ?? "-"}</td>
              <td>{accountName(e.balance_account_id)}</td>
              <td className="row-actions">
                {e.recurrence !== "once" && (
                  <button className="btn-info-sm" onClick={() => onViewHistory(e.id)}><History size={13} /> Lihat History</button>
                )}
                <button className="btn-edit-sm" onClick={() => onEdit(e)}><Pencil size={13} /> Edit</button>
                <button className="btn-danger-sm" onClick={() => onDelete(e.id)}><Trash2 size={13} /> Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IncomeList({ incomes, balances = [], onDelete, onEdit, onViewHistory }) {
  if (incomes.length === 0) return <p className="empty">Belum ada data pemasukan.</p>;
  const accountName = (id) => balances.find((b) => b.id === id)?.name ?? "-";
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sumber</th>
            <th>Jumlah</th>
            <th>Tanggal Gajian</th>
            <th>Tujuan Saldo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {incomes.map((i) => (
            <tr key={i.id}>
              <td>{i.source}</td>
              <td>{fmt(i.amount)}</td>
              <td>Tgl {i.income_day} (tiap bulan)</td>
              <td>{accountName(i.balance_account_id)}</td>
              <td className="row-actions">
                <button className="btn-info-sm" onClick={() => onViewHistory(i.id)}><History size={13} /> Lihat History</button>
                <button className="btn-edit-sm" onClick={() => onEdit(i)}><Pencil size={13} /> Edit</button>
                <button className="btn-danger-sm" onClick={() => onDelete(i.id)}><Trash2 size={13} /> Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
