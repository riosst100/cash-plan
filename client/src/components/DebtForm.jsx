import { useState, useEffect } from "react";
import { formatRupiah } from "../format.js";
import { formatDate } from "../dateFormat.js";
import CurrencyInput from "./CurrencyInput.jsx";

// Bunga efektif: bunga tunggal platform, kecuali paylater tenor 1 bulan yang selalu 0%.
function tenorRate(platform, tenorMonths) {
  if (!platform) return 0;
  if (platform.type === "paylater" && Number(tenorMonths) === 1) return 0;
  return platform.interest_rate ?? 0;
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const empty = {
  type: "pinjol",
  platform: "",
  principal: "",
  tenor_months: "",
  transaction_date: new Date().toISOString().slice(0, 10),
  due_day_override: "",
  notes: "",
};

// Ganti hanya tanggal (day) dari suatu string "YYYY-MM-DD", mempertahankan bulan & tahun,
// dan menyesuaikan jika tanggal melebihi jumlah hari bulan itu (mis. 31 di bulan Februari).
function replaceDay(dateStr, day) {
  if (!dateStr || !day) return dateStr;
  const [y, m] = dateStr.split("-").map(Number);
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  const safeDay = Math.min(Number(day), lastDayOfMonth);
  return `${y}-${String(m).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

// Bunga flat: cicilan/bulan = (plafon / tenor) + (plafon x bunga%), dibulatkan ke bawah
// agar konsisten dengan cara platform pinjol pada umumnya membulatkan cicilan.
function computeInstallment(principal, interestRate, tenorMonths) {
  if (!principal || !tenorMonths) return null;
  const monthlyPrincipal = principal / tenorMonths;
  const monthlyInterest = principal * ((interestRate || 0) / 100);
  return Math.floor(monthlyPrincipal + monthlyInterest);
}

function computeDueDatePreview(platform, transactionDateStr) {
  if (!transactionDateStr) return null;
  const txDate = new Date(transactionDateStr);
  const nextMonth = new Date(txDate.getFullYear(), txDate.getMonth() + 1, 1);
  const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();

  let day;
  if (platform?.due_date_type === "fixed_day" && platform.due_day) {
    day = Math.min(platform.due_day, lastDay);
  } else {
    day = Math.min(txDate.getDate(), lastDay);
  }
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Plafon diambil langsung dari kolom `principal` yang tersimpan. Untuk data lama yang
// belum punya nilai ini, fallback ke perkiraan dari cicilan (bunga flat).
function derivePrincipal(debt, platform) {
  if (!debt) return "";
  if (debt.principal != null) return debt.principal;
  if (debt.tenor_months && debt.min_payment) {
    const rate = tenorRate(platform, debt.tenor_months) / 100;
    const denom = 1 / debt.tenor_months + rate;
    return denom > 0 ? Math.round(debt.min_payment / denom) : debt.outstanding;
  }
  return debt.outstanding;
}

export default function DebtForm({ onSubmit, platforms, editing, onCancelEdit }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editing) {
      const platform = platforms.find((p) => p.name === editing.platform);
      setForm({
        type: editing.type ?? "pinjol",
        platform: editing.platform ?? "",
        principal: derivePrincipal(editing, platform),
        tenor_months: editing.tenor_months ?? "",
        transaction_date: editing.transaction_date
          ? editing.transaction_date.slice(0, 10)
          : editing.due_date
          ? new Date(new Date(editing.due_date).setMonth(new Date(editing.due_date).getMonth() - 1)).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        due_day_override: editing.due_date ? new Date(editing.due_date).getDate() : "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm(empty);
    }
    // Hanya reset form saat berpindah target edit (id berubah), bukan setiap kali
    // referensi `platforms` berubah akibat reload data di tempat lain — supaya
    // perubahan yang sedang diketik user tidak tertimpa balik.
  }, [editing?.id]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePlatformChange(name) {
    const found = platforms.find((p) => p.name === name);
    setForm((f) => ({
      ...f,
      platform: name,
      type: found ? found.type : f.type,
      tenor_months: "",
    }));
  }

  const selectedPlatform = platforms.find((p) => p.name === form.platform);
  const dueDatePreview = computeDueDatePreview(selectedPlatform, form.transaction_date);
  const tenorOptions = selectedPlatform?.tenors ?? [];

  // Tanggal jatuh tempo aktual: bulan & tahun selalu dari hasil kalkulasi (platform + tanggal
  // pengajuan), tapi tanggalnya (day) bisa dioverride manual lewat dropdown.
  const effectiveDueDate = form.due_day_override
    ? replaceDay(dueDatePreview, form.due_day_override)
    : dueDatePreview;

  const principalNum = Number(form.principal) || 0;
  const tenorNum = Number(form.tenor_months) || 0;
  const effectiveRate = tenorRate(selectedPlatform, tenorNum);
  const monthlyInstallment = computeInstallment(principalNum, effectiveRate, tenorNum);
  const totalInstallments = monthlyInstallment && tenorNum ? monthlyInstallment * tenorNum : null;
  const totalPayable = totalInstallments ?? principalNum;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.platform || !form.principal) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        principal: principalNum,
        outstanding: totalPayable,
        min_payment: monthlyInstallment ?? null,
        tenor_months: form.tenor_months ? Number(form.tenor_months) : null,
        due_date: effectiveDueDate || null,
      });
      setForm(empty);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <label>
        Jenis
        <select value={form.type} onChange={(e) => update("type", e.target.value)}>
          <option value="pinjol">Pinjaman Online (Pinjol)</option>
          <option value="paylater">Paylater</option>
          <option value="lainnya">Hutang Lainnya</option>
        </select>
      </label>

      <label>
        Platform / Sumber
        {platforms.length > 0 ? (
          <select value={form.platform} onChange={(e) => handlePlatformChange(e.target.value)} required>
            <option value="" disabled>Pilih platform</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        ) : (
          <>
            <input type="text" disabled placeholder="Belum ada platform" />
            <span className="muted">Tambahkan platform dulu di tab "Platform".</span>
          </>
        )}
      </label>

      <label>
        Plafon (Rp)
        <CurrencyInput value={form.principal} onChange={(v) => update("principal", v)} required />
      </label>

      {selectedPlatform && (
        <p className="muted full">
          Limit platform: Total {selectedPlatform.total_limit != null ? formatRupiah(selectedPlatform.total_limit) : "-"}
          {" · "}
          Sisa {selectedPlatform.remaining_limit != null ? formatRupiah(selectedPlatform.remaining_limit) : "-"}
          {" "}(kelola di tab "Platform")
        </p>
      )}

      {tenorOptions.length > 0 && (
        <label>
          Tenor
          <select value={form.tenor_months} onChange={(e) => update("tenor_months", e.target.value)} required>
            <option value="" disabled>Pilih tenor</option>
            {tenorOptions.map((t) => (
              <option key={t} value={t}>{t} bulan — bunga {tenorRate(selectedPlatform, t)}%</option>
            ))}
          </select>
        </label>
      )}

      {monthlyInstallment != null && (
        <p className="muted full">
          Cicilan per bulan: <strong>{formatRupiah(monthlyInstallment)}</strong>
          {" · "}Total bunga: {formatRupiah((monthlyInstallment - principalNum / tenorNum) * tenorNum)}
          <br />
          Total yang harus dibayar: <strong>{formatRupiah(totalPayable)}</strong>
        </p>
      )}

      <label>
        Tanggal Pengajuan
        <input type="date" value={form.transaction_date} onChange={(e) => update("transaction_date", e.target.value)} required />
      </label>

      <label>
        Jatuh Tempo Setiap Tanggal
        <select value={form.due_day_override} onChange={(e) => update("due_day_override", e.target.value)}>
          <option value="">Otomatis (ikuti platform)</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>Tanggal {d}</option>
          ))}
        </select>
      </label>

      {effectiveDueDate && (
        <p className="muted full">
          Jatuh tempo: <strong>{formatDate(effectiveDueDate)}</strong>
          {!form.due_day_override && (
            selectedPlatform?.due_date_type === "fixed_day"
              ? ` (tanggal tetap ${selectedPlatform.due_day} sesuai platform)`
              : " (mengikuti tanggal pengajuan)"
          )}
        </p>
      )}

      <label className="full">
        Catatan — opsional
        <input type="text" value={form.notes} onChange={(e) => update("notes", e.target.value)} />
      </label>

      <div className="full row-actions">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Hutang"}
        </button>
        <button type="button" className="btn-secondary-sm" onClick={onCancelEdit}>
          Batal
        </button>
      </div>
    </form>
  );
}
