export default function ConfirmDialog({ title, message, confirmLabel = "Ya, Lanjutkan", danger, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-close" onClick={onCancel}>✕</button>
        </div>
        <p className="muted">{message}</p>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button className={danger ? "btn-danger-sm" : "btn-success-sm"} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className="btn-info-sm" onClick={onCancel}>Batal</button>
        </div>
      </div>
    </div>
  );
}
