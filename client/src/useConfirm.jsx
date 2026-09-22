import { useState, useCallback } from "react";
import ConfirmDialog from "./components/ConfirmDialog.jsx";

// Hook konfirmasi generik: confirm({ title, message, danger, confirmLabel }) mengembalikan
// Promise<boolean>. Render `dialog` di JSX pemanggil untuk menampilkan modalnya.
export function useConfirm() {
  const [state, setState] = useState(null); // { title, message, danger, confirmLabel, resolve }

  const confirm = useCallback((config) => {
    return new Promise((resolve) => {
      setState({ ...config, resolve });
    });
  }, []);

  function handleConfirm() {
    state?.resolve(true);
    setState(null);
  }

  function handleCancel() {
    state?.resolve(false);
    setState(null);
  }

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      danger={state.danger}
      confirmLabel={state.confirmLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, dialog };
}
