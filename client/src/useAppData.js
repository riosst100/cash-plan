import { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

// Hook bersama untuk data & aksi yang dipakai lintas halaman (Platform, Loan, dst).
export function useAppData() {
  const [platforms, setPlatforms] = useState([]);
  const [debts, setDebts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [error, setError] = useState("");
  const [showPaidDebts, setShowPaidDebts] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [p, d, e, i, b] = await Promise.all([
        api.getPlatforms(),
        api.getDebts(showPaidDebts),
        api.getExpenses(),
        api.getIncomes(),
        api.getBalances(),
      ]);
      setPlatforms(p);
      setDebts(d);
      setExpenses(e);
      setIncomes(i);
      setBalances(b);
    } catch (err) {
      setError(err.message);
    }
  }, [showPaidDebts]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
    platforms,
    debts,
    expenses,
    incomes,
    balances,
    error,
    setError,
    showPaidDebts,
    setShowPaidDebts,
    loadAll,
  };
}
