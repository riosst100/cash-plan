// Format tanggal jadi "02/09/2026". Menerima Date, "YYYY-MM-DD", atau string tanggal lain.
export function formatDate(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Ambil tanggalnya saja (tanpa bulan/tahun), mis. untuk pola jatuh tempo bulanan: "Tgl 28".
export function formatDayOnly(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `Tgl ${date.getDate()}`;
}
