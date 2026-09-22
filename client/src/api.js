const BASE = "/api";

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getPlatforms: () => request("/platforms"),
  addPlatform: (data) => request("/platforms", { method: "POST", body: JSON.stringify(data) }),
  updatePlatform: (id, data) => request(`/platforms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePlatform: (id) => request(`/platforms/${id}`, { method: "DELETE" }),

  getDebts: (includeAll) => request(`/debts${includeAll ? "?status=all" : ""}`),
  addDebt: (data) => request("/debts", { method: "POST", body: JSON.stringify(data) }),
  updateDebt: (id, data) => request(`/debts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateDebtStatus: (id, status) => request(`/debts/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteDebt: (id) => request(`/debts/${id}`, { method: "DELETE" }),
  getDebtInstallments: (id) => request(`/debts/${id}/installments`),
  updateInstallmentStatus: (debtId, installmentId, status) =>
    request(`/debts/${debtId}/installments/${installmentId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateInstallmentAmount: (debtId, installmentId, amount) =>
    request(`/debts/${debtId}/installments/${installmentId}`, { method: "PATCH", body: JSON.stringify({ amount }) }),

  getExpenses: () => request("/expenses"),
  addExpense: (data) => request("/expenses", { method: "POST", body: JSON.stringify(data) }),
  updateExpense: (id, data) => request(`/expenses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: "DELETE" }),
  getExpenseHistory: (id) => request(`/expenses/${id}/history`),

  getIncomes: () => request("/incomes"),
  addIncome: (data) => request("/incomes", { method: "POST", body: JSON.stringify(data) }),
  updateIncome: (id, data) => request(`/incomes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteIncome: (id) => request(`/incomes/${id}`, { method: "DELETE" }),
  getIncomeHistory: (id) => request(`/incomes/${id}/history`),

  analyze: () => request("/analyze", { method: "POST" }),
  getSummary: () => request("/summary"),
  getSummaryLoan: () => request("/summary/loan"),

  getSetting: (key) => request(`/settings/${key}`),
  setSetting: (key, value) => request(`/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),

  getBalances: () => request("/balances"),
  addBalance: (data) => request("/balances", { method: "POST", body: JSON.stringify(data) }),
  updateBalance: (id, data) => request(`/balances/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBalance: (id) => request(`/balances/${id}`, { method: "DELETE" }),
};
