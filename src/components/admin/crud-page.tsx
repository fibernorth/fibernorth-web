"use client";

import { useState } from "react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { createDocument, updateDocument, deleteDocument } from "@/actions/crud";
import { DeleteDialog } from "@/components/admin/delete-dialog";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { orderBy, type QueryConstraint } from "firebase/firestore";

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface CrudPageProps<T> {
  title: string;
  /** Singular item name for form headings; defaults to title minus trailing "s" */
  itemLabel?: string;
  collection: string;
  columns: Column<T>[];
  renderForm: (
    item: T | null,
    onChange: (field: string, value: unknown) => void,
    formData: Record<string, unknown>
  ) => React.ReactNode;
  defaultValues: Record<string, unknown>;
  orderByField?: string;
  constraints?: QueryConstraint[];
  icon?: React.ReactNode;
}

export function CrudPage<T extends { id: string }>({
  title,
  itemLabel,
  collection,
  columns,
  renderForm,
  defaultValues,
  orderByField = "createdAt",
  constraints,
  icon,
}: CrudPageProps<T>) {
  const { data, loading, error } = useFirestoreCollection<T>(collection, {
    constraints: constraints ?? [orderBy(orderByField, "desc")],
  });
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>(defaultValues);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = () => {
    setFormData({ ...defaultValues });
    setCreating(true);
    setEditing(null);
  };

  const handleEdit = (item: T) => {
    setFormData(item as unknown as Record<string, unknown>);
    setEditing(item);
    setCreating(false);
  };

  const handleCancel = () => {
    setCreating(false);
    setEditing(null);
    setFormData(defaultValues);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setSaveError("Your session has expired. Please sign in again.");
        return;
      }

      const { id: _, ...saveData } = formData;

      if (editing) {
        await updateDocument(collection, editing.id, saveData, token);
      } else {
        await createDocument(collection, saveData, token);
      }
      handleCancel();
    } catch (err) {
      console.error("Save failed:", err);
      const raw = err instanceof Error ? err.message : "";
      setSaveError(
        raw && !raw.includes("Unable to detect a Project Id")
          ? raw
          : "Save failed. Please try again — if it keeps happening, sign out and back in."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: T) => {
    setDeleteError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      await deleteDocument(collection, item.id, token);
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleteError(
        err instanceof Error ? err.message : "Delete failed. Please try again."
      );
      throw err;
    }
  };

  const singular = itemLabel ?? title.replace(/s$/, "");

  if (creating || editing) {
    return (
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {editing ? `Edit ${singular}` : `New ${singular}`}
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
        {saveError && (
          <div
            role="alert"
            className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-4 text-sm"
          >
            {saveError}
          </div>
        )}
        <div className="bg-card border border-border rounded-lg p-6 space-y-5">
          {renderForm(editing, onChange, formData)}
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add New
        </button>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-4 text-sm"
        >
          {deleteError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-6"
        >
          <p className="font-medium text-sm mb-1">
            Failed to load {title.toLowerCase()}
          </p>
          <p className="text-sm">{error.message}</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">
            No {title.toLowerCase()} yet. Click &quot;Add New&quot; to create one.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-3 text-sm">
                      {col.render
                        ? col.render(item)
                        : String(
                            (item as Record<string, unknown>)[
                              String(col.key)
                            ] ?? ""
                          )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <DeleteDialog
                        itemName={title.replace(/s$/, "")}
                        onDelete={() => handleDelete(item)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
