import { useState } from "react";
import { api } from "../api.js";
import PlatformForm from "../components/PlatformForm.jsx";
import { PlatformList } from "../components/DataLists.jsx";
import { useConfirm } from "../useConfirm.jsx";

export default function PlatformPage({ platforms, loadAll }) {
  const [editingPlatform, setEditingPlatform] = useState(null);
  const { confirm, dialog } = useConfirm();

  return (
    <section>
      <PlatformForm
        editing={editingPlatform}
        onCancelEdit={() => setEditingPlatform(null)}
        onSubmit={async (data) => {
          if (editingPlatform) {
            await api.updatePlatform(editingPlatform.id, data);
            setEditingPlatform(null);
          } else {
            await api.addPlatform(data);
          }
          await loadAll();
        }}
      />
      <PlatformList
        platforms={platforms}
        onEdit={(platform) => setEditingPlatform(platform)}
        onDelete={async (id) => {
          const platform = platforms.find((p) => p.id === id);
          const ok = await confirm({
            title: "Hapus platform ini?",
            message: `Platform ${platform?.name ?? ""} akan dihapus permanen. Hutang yang sudah terkait dengan platform ini tidak ikut terhapus.`,
            confirmLabel: "Ya, Hapus",
            danger: true,
          });
          if (!ok) return;
          await api.deletePlatform(id);
          await loadAll();
        }}
      />
      {dialog}
    </section>
  );
}
