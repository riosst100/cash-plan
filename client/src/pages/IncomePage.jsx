import { useState } from "react";
import { api } from "../api.js";
import IncomeForm from "../components/IncomeForm.jsx";
import { IncomeList } from "../components/DataLists.jsx";
import HistoryModal from "../components/HistoryModal.jsx";
import { formatRupiah } from "../format.js";

export default function IncomePage({ incomes, loadAll }) {
  const [incomeHistoryId, setIncomeHistoryId] = useState(null);

  return (
    <section>
      <IncomeForm
        onSubmit={async (data) => {
          await api.addIncome(data);
          await loadAll();
        }}
      />
      <IncomeList
        incomes={incomes}
        onDelete={async (id) => {
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
    </section>
  );
}
