// Format angka rupiah dengan pemisah ribuan: Rp5.000.000
export function formatRupiah(amount) {
  const n = Math.round(Number(amount) || 0);
  return `Rp${n.toLocaleString("id-ID")}`;
}
