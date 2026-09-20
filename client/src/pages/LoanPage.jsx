import { useState } from "react";
import { api } from "../api.js";
import DebtForm from "../components/DebtForm.jsx";
import { DebtList } from "../components/DataLists.jsx";

export default function LoanPage({ platforms, debts, showPaidDebts, setShowPaidDebts, loadAll, setError }) {
  const [editingDebt, setEditingDebt] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);

  function openAddModal() {
    setEditingDebt(null);
    setShowFormModal(true);
  }

  function openEditModal(debt) {
    setEditingDebt(debt);
    setShowFormModal(true);
  }

  function closeModal() {
    setShowFormModal(false);
    setEditingDebt(null);
  }

  return (
    <section>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button className="btn-primary" onClick={openAddModal}>+ Tambah Hutang</button>
      </div>

      <label className="checkbox-chip" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={showPaidDebts} onChange={(e) => setShowPaidDebts(e.target.checked)} />
        Tampilkan yang sudah lunas
      </label>
      <DebtList
        debts={debts}
        platforms={platforms}
        onEdit={openEditModal}
        onInstallmentChanged={loadAll}
        onMarkPaid={async (id) => {
          await api.updateDebtStatus(id, "paid");
          await loadAll();
        }}
        onMarkActive={async (id) => {
          await api.updateDebtStatus(id, "active");
          await loadAll();
        }}
        onDelete={async (id) => {
          await api.deleteDebt(id);
          await loadAll();
        }}
      />

      {showFormModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingDebt ? "Edit Hutang" : "Tambah Hutang"}</h3>
              <button className="btn-close" onClick={closeModal}>✕</button>
            </div>
            <DebtForm
              platforms={platforms}
              editing={editingDebt}
              onCancelEdit={closeModal}
              onSubmit={async (data) => {
                try {
                  setError("");
                  if (editingDebt) {
                    await api.updateDebt(editingDebt.id, data);
                  } else {
                    await api.addDebt(data);
                  }
                  await loadAll();
                  closeModal();
                } catch (err) {
                  setError(err.message);
                }
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
