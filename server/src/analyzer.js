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

const MONTH_NAMES_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function shortLabel(date) {
  return `${date.getDate()} ${MONTH_NAMES_ID[date.getMonth()]}`;
}

// Tanggal mulai siklus bulanan ke-n, mengikuti tanggal gajian (payday) sebagai titik awal
// setiap periode, bukan tanggal 1 kalender.
function cycleStartDate(today, payday, cycleIndex) {
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const thisMonthPayday = new Date(today.getFullYear(), today.getMonth(), Math.min(payday, daysInMonth(today.getFullYear(), today.getMonth())));
  const baseMonthOffset = today.getDate() >= thisMonthPayday.getDate() ? 0 : -1;
  const targetMonth = today.getMonth() + baseMonthOffset + cycleIndex;
  const targetYear = today.getFullYear();
  const d = new Date(targetYear, targetMonth, 1);
  const day = Math.min(payday, daysInMonth(d.getFullYear(), d.getMonth()));
  return new Date(d.getFullYear(), d.getMonth(), day);
}

export function analyzeDebts({ debts, expenses, incomes, platforms = [], payday = 1 }) {
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
    const cycleStart = cycleStartDate(today, payday, month - 1);
    const cycleEnd = cycleStartDate(today, payday, month);
    const cycleEndDisplay = new Date(cycleEnd);
    cycleEndDisplay.setDate(cycleEndDisplay.getDate() - 1);
    monthlyProjection.push({
      month,
      periodLabel: `${shortLabel(cycleStart)} - ${shortLabel(cycleEndDisplay)}`,
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

  // ---------- STRATEGI DARURAT BULAN INI ----------
  // Kalau gaji + dana yang ada TIDAK CUKUP untuk membayar semua cicilan minimum bulan ini,
  // hitung mana yang WAJIB dibayar (prioritas tertinggi) dan mana yang harus ditunda/direstruktur,
  // plus opsi darurat gali-lubang-tutup-lubang terkendali kalau ada sisa limit platform lain.
  let emergencyPlan = null;
  const availableForDebts = totalIncome - totalExpense;
  if (availableForDebts < totalMinPayments) {
    const payable = [];
    const deferred = [];
    let remaining = Math.max(availableForDebts, 0);

    for (const d of scored) {
      const need = estimateMinPayment(d);
      if (remaining >= need) {
        payable.push({ platform: d.platform, id: d.id, amount: Math.round(need), due_date: d.due_date });
        remaining -= need;
      } else {
        deferred.push({
          platform: d.platform,
          id: d.id,
          amount: Math.round(need),
          due_date: d.due_date,
          rate_monthly_pct: Math.round(d.rate_monthly_pct * 100) / 100,
        });
      }
    }

    const totalShortfall = deferred.reduce((s, d) => s + d.amount, 0);

    // Cari platform dengan sisa limit yang masih bisa dipakai untuk menutup kekurangan darurat,
    // diurutkan dari bunga TERENDAH dulu (paling tidak merugikan) di antara opsi yang tersedia.
    // Sumbernya SEMUA platform terdaftar (bukan cuma yang sudah punya hutang aktif), supaya
    // platform dengan limit menganggur (mis. belum pernah dipakai) tetap terhitung sebagai opsi.
    const rescueSource = platforms.length > 0 ? platforms : debts;
    const rescueByPlatform = new Map();
    for (const p of rescueSource) {
      if ((p.remaining_limit || 0) <= 0) continue;
      const platformName = p.platform ?? p.name;
      if (!rescueByPlatform.has(platformName)) {
        rescueByPlatform.set(platformName, {
          platform: platformName,
          remaining_limit: p.remaining_limit,
          rate_monthly_pct: Math.round(monthlyRate(p) * 10000) / 100,
        });
      }
    }
    const rescueCandidates = [...rescueByPlatform.values()].sort((a, b) => a.rate_monthly_pct - b.rate_monthly_pct);

    const rescueMessages = [];
    let stillShort = totalShortfall;
    const rescuePlan = [];
    for (const c of rescueCandidates) {
      if (stillShort <= 0) break;
      const use = Math.min(c.remaining_limit, stillShort);
      if (use <= 0) continue;
      rescuePlan.push({ platform: c.platform, amount: Math.round(use), rate_monthly_pct: c.rate_monthly_pct });
      stillShort -= use;
    }

    if (deferred.length > 0) {
      rescueMessages.push(
        `Gaji bulan ini hanya cukup membayar ${payable.length} dari ${scored.length} cicilan (kekurangan sekitar Rp${Math.round(
          totalShortfall
        ).toLocaleString("id-ID")}). Cicilan yang WAJIB dibayar dulu (prioritas tertinggi/jatuh tempo terdekat) sudah diurutkan di tabel Prioritas Pelunasan di atas.`
      );
      if (rescuePlan.length > 0 && stillShort <= 0) {
        rescueMessages.push(
          `DARURAT TERKENDALI: sisa limit di ${rescuePlan
            .map((r) => `${r.platform} (Rp${r.amount.toLocaleString("id-ID")}, bunga ${r.rate_monthly_pct}%/bln)`)
            .join(", ")} bisa dipakai HANYA untuk menutup cicilan yang tertunda ini — TIDAK untuk kebutuhan lain. Ini menambah hutang baru, jadi hanya lakukan jika benar-benar tidak ada cara lain, dan segera lunasi begitu ada dana dari gaji berikutnya.`
        );
      } else if (rescuePlan.length > 0) {
        rescueMessages.push(
          `Sisa limit yang tersedia (${rescuePlan
            .map((r) => r.platform)
            .join(", ")}) TIDAK CUKUP menutup seluruh kekurangan — masih kurang sekitar Rp${Math.round(
            stillShort
          ).toLocaleString("id-ID")}. Segera hubungi platform yang cicilannya tertunda untuk restrukturisasi/perpanjangan tenor sebelum jatuh tempo, agar tidak kena denda atau masuk daftar hitam (SLIK/blacklist).`
        );
      } else {
        rescueMessages.push(
          "Tidak ada sisa limit platform yang bisa dipakai untuk menutup kekurangan. Segera hubungi platform yang cicilannya tertunda untuk restrukturisasi/perpanjangan tenor sebelum jatuh tempo, dan pertimbangkan bantuan dari keluarga/pihak lain sebagai jalan terakhir sebelum gagal bayar."
        );
      }
    }

    emergencyPlan = {
      totalAvailable: Math.round(Math.max(availableForDebts, 0)),
      totalNeeded: Math.round(totalMinPayments),
      shortfall: Math.round(totalShortfall),
      payable,
      deferred,
      rescuePlan,
      messages: rescueMessages,
    };
  }

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
    emergencyPlan,
  };
}
