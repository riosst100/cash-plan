import { useState } from "react";
import { api } from "../api.js";
import ExpenseForm from "../components/ExpenseForm.jsx";
import { ExpenseList } from "../components/DataLists.jsx";
import HistoryModal from "../components/HistoryModal.jsx";
import { formatRupiah } from "../format.js";

export default function ExpensePage({ expenses, loadAll }) {
  const [expenseHistoryId, setExpenseHistoryId] = useState(null);

  return (
    <section>
      <ExpenseForm
        onSubmit={async (data) => {
          await api.addExpense(data);
          await loadAll();
        }}
      />
      <ExpenseList
        expenses={expenses}
        onDelete={async (id) => {
          await api.deleteExpense(id);
          await loadAll();
        }}
        onViewHistory={(id) => setExpenseHistoryId(id)}
      />

      {expenseHistoryId && (
        <HistoryModal
          title="History Pengeluaran"
          subtitle={(data) =>
            data.rule.recurrence === "weekday"
              ? `${formatRupiah(data.rule.amount)} tiap hari kerja`
              : `${formatRupiah(data.rule.amount)} setiap tanggal ${data.rule.expense_day}`
          }
          dateKey="expense_date"
          fetcher={() => api.getExpenseHistory(expenseHistoryId)}
          onClose={() => setExpenseHistoryId(null)}
        />
      )}
    </section>
  );
}
