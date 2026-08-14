"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteDialogProps {
  itemName: string;
  onDelete: () => Promise<void>;
}

export function DeleteDialog({ itemName, onDelete }: DeleteDialogProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    cancelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setOpen(false);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${itemName}?`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg">
        <h3 className="text-lg font-semibold mb-2">Delete {itemName}?</h3>
        <p className="text-sm text-muted-foreground mb-6">
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={() => setOpen(false)}
            disabled={deleting}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors flex items-center gap-2"
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
