import { useState } from "react";
import { api } from "../api.js";
import PlatformForm from "../components/PlatformForm.jsx";
import { PlatformList } from "../components/DataLists.jsx";

export default function PlatformPage({ platforms, loadAll }) {
  const [editingPlatform, setEditingPlatform] = useState(null);

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
          await api.deletePlatform(id);
          await loadAll();
        }}
      />
    </section>
  );
}
