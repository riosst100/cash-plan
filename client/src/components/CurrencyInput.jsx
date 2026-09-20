import { useState, useEffect } from "react";

// Input angka yang otomatis diformat dengan pemisah ribuan (titik) saat diketik,
// tapi tetap melaporkan nilai numerik murni ke parent lewat onChange.
function digitsOnly(str) {
  return (str || "").replace(/[^\d]/g, "");
}

function formatDigits(digits) {
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

export default function CurrencyInput({ value, onChange, placeholder, required, min }) {
  const [display, setDisplay] = useState(value != null && value !== "" ? formatDigits(String(value)) : "");

  useEffect(() => {
    const raw = value != null && value !== "" ? String(value) : "";
    setDisplay(raw ? formatDigits(digitsOnly(raw)) : "");
  }, [value]);

  function handleChange(e) {
    const digits = digitsOnly(e.target.value);
    setDisplay(formatDigits(digits));
    onChange(digits ? digits : "");
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      min={min}
    />
  );
}
