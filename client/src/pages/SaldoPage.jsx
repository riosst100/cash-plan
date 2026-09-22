import { useState } from "react";
import { api } from "../api.js";
import BalanceForm from "../components/BalanceForm.jsx";
import { BalanceList } from "../components/DataLists.jsx";
import { useConfirm } from "../useConfirm.jsx";

export default function SaldoPage({ balances, loadAll }) {
  const [editingBalance, setEditingBalance] = useState(null);
  const { confirm, dialog } = useConfirm();

  return (
    <section>
      <BalanceForm
        editing={editingBalance}
        onCancelEdit={() => setEditingBalance(null)}
        onSubmit={async (data) => {
          if (editingBalance) {
            await api.updateBalance(editingBalance.id, data);
            setEditingBalance(null);
          } else {
            await api.addBalance(data);
          }
          await loadAll();
        }}
      />
      <BalanceList
        balances={balances}
        onEdit={(b) => setEditingBalance(b)}
        onDelete={async (id) => {
          const account = balances.find((b) => b.id === id);
          const ok = await confirm({
            title: "Hapus akun saldo ini?",
            message: `Akun ${account?.name ?? ""} akan dihapus permanen. Transaksi yang sudah dikaitkan ke akun ini tidak ikut terhapus.`,
            confirmLabel: "Ya, Hapus",
            danger: true,
          });
          if (!ok) return;
          await api.deleteBalance(id);
          await loadAll();
        }}
      />
      {dialog}
    </section>
  );
}
