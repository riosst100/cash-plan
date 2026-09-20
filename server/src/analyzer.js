// Mesin analisis kredit & strategi bebas hutang.
// Pendekatan: hitung arus kas bulanan (gaji - pengeluaran wajib),
// alokasikan sisa dana ("dana bebas") ke hutang dengan prioritas
// campuran avalanche (bunga tertinggi) + urgensi jatuh tempo,
// simulasikan bulan demi bulan sampai semua hutang lunas.

function monthlyRate(debt) {
  const r = Number(debt.interest_rate) || 0;
  if (debt.interest_period === "yearly") return r / 100 / 12;
  if (debt.interest_period === "daily") return (r / 100) * 30;
  return r / 100; // monthly
}

function daysUntil(dateStr, from = new Date()) {
  const d = new Date(dateStr);
  const diff = Math.ceil((d.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function urgencyScore(debt, today) {
  const dd = daysUntil(debt.due_date, today);
  if (dd <= 3) return 100;
  if (dd <= 7) return 80;
  if (dd <= 14) return 60;
  if (dd <= 30) return 40;
  return 20;
}

// Skor prioritas: gabungan urgensi jatuh tempo + bunga tinggi (bahaya pinjol/paylater).
function priorityScore(debt, today) {
  const rate = monthlyRate(debt) * 100; // persen per bulan
  const urgency = urgencyScore(debt, today);
  const rateScore = Math.min(rate * 4, 100); // bunga 25%/bln => skor 100
  return urgency * 0.55 + rateScore * 0.45;
}

function estimateMinPayment(debt) {
  if (debt.min_payment && debt.min_payment > 0) return debt.min_payment;
  const rate = monthlyRate(debt);
  const interest = debt.outstanding * rate;
  const principalFloor = debt.outstanding * 0.05; // asumsi minimum 5% pokok/bulan bila tak diketahui
  return Math.max(interest + principalFloor, debt.outstanding * 0.1, 50000);
}

export function analyzeDebts({ debts, expenses, incomes }) {
  const today = new Date();

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalOutstanding = debts.reduce((s, d) => s + d.outstanding, 0);
  const totalMinPayments = debts.reduce((s, d) => s + estimateMinPayment(d), 0);

  const freeCashFlow = totalIncome - totalExpense - totalMinPayments;

  const warnings = [];
  const recommendations = [];

  if (debts.length === 0) {
    return {
      summary: {
        totalIncome,
        totalExpense,
        totalOutstanding,
        totalMinPayments,
        freeCashFlow,
        debtToIncomeRatio: 0,
      },
      warnings: ["Belum ada data hutang. Tambahkan pinjol/paylater untuk mendapat analisis lengkap."],
      recommendations: [],
      priorityOrder: [],
      monthlyProjection: [],
      payoffEstimateMonths: 0,
      totalInterestProjected: 0,
      canBorrowMoreSafely: totalIncome > 0,
      maxSafeNewLoanInstallment: Math.max(0, freeCashFlow * 0.3),
    };
  }

  const debtToIncomeRatio = totalIncome > 0 ? totalOutstanding / totalIncome : Infinity;

  // Urutan prioritas pelunasan
  const scored = debts
    .map((d) => ({ ...d, score: priorityScore(d, today), rate_monthly_pct: monthlyRate(d) * 100 }))
    .sort((a, b) => b.score - a.score);

  const priorityOrder = scored.map((d, idx) => ({
    rank: idx + 1,
    id: d.id,
    platform: d.platform,
    type: d.type,
    outstanding: d.outstanding,
    interest_rate: d.interest_rate,
    interest_period: d.interest_period,
    due_date: d.due_date,
    days_until_due: daysUntil(d.due_date, today),
    rate_monthly_pct: Math.round(d.rate_monthly_pct * 100) / 100,
    reason:
      d.rate_monthly_pct >= 5
        ? "Bunga sangat tinggi (khas pinjol ilegal/berisiko) — prioritas utama dilunasi."
        : daysUntil(d.due_date, today) <= 7
        ? "Jatuh tempo sangat dekat — bayar dulu untuk hindari denda/penalti."
        : "Prioritas menengah, tetap dicicil sesuai jadwal.",
  }));

  // Peringatan dasar
  if (freeCashFlow < 0) {
    warnings.push(
      `Arus kas bulanan NEGATIF sebesar Rp${Math.abs(Math.round(freeCashFlow)).toLocaleString("id-ID")}. Pengeluaran + cicilan minimum melebihi gaji.`
    );
  }
  if (debtToIncomeRatio > 3) {
    warnings.push("Rasio total hutang terhadap gaji bulanan sangat tinggi (>3x). Risiko gagal bayar besar.");
  }
  const illegalRisk = debts.filter((d) => monthlyRate(d) * 100 >= 10);
  if (illegalRisk.length > 0) {
    warnings.push(
      `Terdeteksi ${illegalRisk.length} pinjaman dengan bunga sangat tinggi (>=10%/bulan) — ciri pinjol ilegal. Pertimbangkan lapor OJK/AFPI atau hindari perpanjangan otomatis.`
    );
  }

  // Simulasi bulanan (avalanche pada dana bebas, snowball ketika dana bebas sangat kecil)
  const sim = scored.map((d) => ({
    id: d.id,
    platform: d.platform,
    balance: d.outstanding,
    rate: monthlyRate(d),
    minPay: estimateMinPayment(d),
  }));

  // Jika dana bebas negatif/kecil, gunakan urutan "snowball" (hutang terkecil dulu) supaya cepat ada win psikologis
  // dan mengurangi jumlah cicilan aktif secepat mungkin.
  const useSnowball = freeCashFlow < totalMinPayments * 0.2;
  if (useSnowball) {
    sim.sort((a, b) => a.balance - b.balance);
    recommendations.push(
      "Karena dana bebas terbatas, gunakan strategi SNOWBALL: fokuskan kelebihan dana untuk melunasi hutang bernominal TERKECIL dulu, agar jumlah cicilan aktif cepat berkurang dan psikologis lebih ringan."
    );
  } else {
    recommendations.push(
      "Dana bebas cukup memadai, gunakan strategi AVALANCHE: fokuskan kelebihan dana untuk melunasi hutang dengan BUNGA TERTINGGI dulu agar total bunga yang dibayar minimal."
    );
  }

  const monthlyProjection = [];
  let month = 0;
  let extra = Math.max(freeCashFlow, 0);
  let totalInterestProjected = 0;
  const maxMonths = 120;

  while (sim.some((d) => d.balance > 0.5) && month < maxMonths) {
    month += 1;
    let monthInterest = 0;
    let monthPrincipal = 0;
    let remainingExtra = extra;

    // bunga & minimum payment dulu
    for (const d of sim) {
      if (d.balance <= 0) continue;
      const interest = d.balance * d.rate;
      monthInterest += interest;
      d.balance += interest;
      const pay = Math.min(d.minPay, d.balance);
      d.balance -= pay;
      monthPrincipal += pay;
    }

    // alokasikan dana ekstra ke prioritas teratas yang masih ada saldo
    for (const d of sim) {
      if (remainingExtra <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(remainingExtra, d.balance);
      d.balance -= pay;
      remainingExtra -= pay;
      monthPrincipal += pay;
    }

    totalInterestProjected += monthInterest;
    monthlyProjection.push({
      month,
      totalBalance: Math.round(sim.reduce((s, d) => s + Math.max(d.balance, 0), 0)),
      interestPaid: Math.round(monthInterest),
      principalPaid: Math.round(monthPrincipal),
      debtsRemaining: sim.filter((d) => d.balance > 0.5).length,
    });
  }

  const payoffEstimateMonths = month;

  if (payoffEstimateMonths >= maxMonths) {
    warnings.push(
      "Dengan kondisi arus kas saat ini, hutang diproyeksikan TIDAK lunas dalam 10 tahun. Perlu pemotongan pengeluaran drastis atau tambahan penghasilan."
    );
  }

  // Rekomendasi pemotongan pengeluaran non-esensial
  const nonEssentialCategories = ["hiburan", "belanja", "jajan", "langganan", "rokok", "lainnya"];
  const nonEssential = expenses.filter((e) =>
    nonEssentialCategories.some((c) => (e.category || "").toLowerCase().includes(c))
  );
  const nonEssentialTotal = nonEssential.reduce((s, e) => s + e.amount, 0);
  if (nonEssentialTotal > 0) {
    recommendations.push(
      `Ditemukan pengeluaran non-esensial sekitar Rp${Math.round(nonEssentialTotal).toLocaleString(
        "id-ID"
      )}/bulan (hiburan/belanja/langganan). Memangkas 50% dari ini bisa mempercepat pelunasan hutang.`
    );
  }

  if (freeCashFlow < 0) {
    recommendations.push(
      "Arus kas negatif: prioritaskan restrukturisasi/perpanjangan tenor pada platform yang memungkinkan, dan HENTIKAN pengajuan pinjaman/paylater baru untuk konsumsi."
    );
  }

  // Kapan boleh pinjam lagi secara aman (untuk konsolidasi, BUKAN gali lubang tutup lubang biasa)
  const maxSafeNewLoanInstallment = Math.max(0, freeCashFlow * 0.3);
  const canBorrowMoreSafely = freeCashFlow > 0 && debtToIncomeRatio < 3 && illegalRisk.length === 0;

  if (canBorrowMoreSafely && debts.length > 1) {
    recommendations.push(
      `Jika tersedia pinjaman BUNGA RENDAH (misal KTA bank/koperasi resmi) untuk KONSOLIDASI, cicilan barunya sebaiknya tidak melebihi Rp${Math.round(
        maxSafeNewLoanInstallment
      ).toLocaleString("id-ID")}/bulan. Gunakan HANYA untuk melunasi pinjol/paylater berbunga tinggi, bukan untuk konsumsi baru.`
    );
  } else {
    recommendations.push(
      "TIDAK disarankan mengambil pinjaman baru saat ini. Fokus dulu menyelesaikan hutang berbunga tinggi dan menstabilkan arus kas."
    );
  }

  recommendations.push(
    "Sisihkan dana darurat kecil (meski Rp50.000-100.000/bulan) di luar rencana pelunasan agar tidak terpaksa pinjam lagi saat ada kebutuhan mendadak."
  );

  return {
    summary: {
      totalIncome,
      totalExpense,
      totalOutstanding,
      totalMinPayments: Math.round(totalMinPayments),
      freeCashFlow: Math.round(freeCashFlow),
      debtToIncomeRatio: Math.round(debtToIncomeRatio * 100) / 100,
    },
    warnings,
    recommendations,
    priorityOrder,
    strategy: useSnowball ? "snowball" : "avalanche",
    monthlyProjection,
    payoffEstimateMonths,
    totalInterestProjected: Math.round(totalInterestProjected),
    canBorrowMoreSafely,
    maxSafeNewLoanInstallment: Math.round(maxSafeNewLoanInstallment),
  };
}
