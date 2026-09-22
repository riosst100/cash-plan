import { useState } from "react";
import { api } from "../api.js";
import IncomeForm from "../components/IncomeForm.jsx";
import { IncomeList } from "../components/DataLists.jsx";
import HistoryModal from "../components/HistoryModal.jsx";
import { formatRupiah } from "../format.js";
import { useConfirm } from "../useConfirm.jsx";

export default function IncomePage({ incomes, balances, loadAll }) {
  const [incomeHistoryId, setIncomeHistoryId] = useState(null);
  const [editingIncome, setEditingIncome] = useState(null);
  const { confirm, dialog } = useConfirm();

  return (
    <section>
      <IncomeForm
        balances={balances}
        editing={editingIncome}
        onCancelEdit={() => setEditingIncome(null)}
        onSubmit={async (data) => {
          if (editingIncome) {
            await api.updateIncome(editingIncome.id, data);
            setEditingIncome(null);
          } else {
            await api.addIncome(data);
          }
          await loadAll();
        }}
      />
      <IncomeList
        incomes={incomes}
        balances={balances}
        onEdit={(i) => setEditingIncome(i)}
        onDelete={async (id) => {
          const item = incomes.find((i) => i.id === id);
          const ok = await confirm({
            title: "Hapus pemasukan ini?",
            message: `Pemasukan ${item?.source ?? ""} beserta seluruh riwayatnya akan dihapus permanen.`,
            confirmLabel: "Ya, Hapus",
            danger: true,
          });
          if (!ok) return;
          await api.deleteIncome(id);
          await loadAll();
        }}
        onViewHistory={(id) => setIncomeHistoryId(id)}
      />

      {incomeHistoryId && (
        <HistoryModal
          title="History Pemasukan"
          subtitle={(data) => `${formatRupiah(data.rule.amount)} setiap tanggal ${data.rule.income_day}`}
          dateKey="income_date"
          fetcher={() => api.getIncomeHistory(incomeHistoryId)}
          onClose={() => setIncomeHistoryId(null)}
        />
      )}
      {dialog}
    </section>
  );
}
