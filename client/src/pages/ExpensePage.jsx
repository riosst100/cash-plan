import { useState } from "react";
import { api } from "../api.js";
import ExpenseForm from "../components/ExpenseForm.jsx";
import { ExpenseList } from "../components/DataLists.jsx";
import HistoryModal from "../components/HistoryModal.jsx";
import { formatRupiah } from "../format.js";
import { useConfirm } from "../useConfirm.jsx";

export default function ExpensePage({ expenses, balances, loadAll }) {
  const [expenseHistoryId, setExpenseHistoryId] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const { confirm, dialog } = useConfirm();

  return (
    <section>
      <ExpenseForm
        balances={balances}
        editing={editingExpense}
        onCancelEdit={() => setEditingExpense(null)}
        onSubmit={async (data) => {
          if (editingExpense) {
            await api.updateExpense(editingExpense.id, data);
            setEditingExpense(null);
          } else {
            await api.addExpense(data);
          }
          await loadAll();
        }}
      />
      <ExpenseList
        expenses={expenses}
        balances={balances}
        onEdit={(e) => setEditingExpense(e)}
        onDelete={async (id) => {
          const item = expenses.find((e) => e.id === id);
          const ok = await confirm({
            title: "Hapus pengeluaran ini?",
            message: `Pengeluaran ${item?.category ?? ""} beserta seluruh riwayatnya akan dihapus permanen.`,
            confirmLabel: "Ya, Hapus",
            danger: true,
          });
          if (!ok) return;
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
      {dialog}
    </section>
  );
}
