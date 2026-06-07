"use client";

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminFormProps {
  title: string;
  children: React.ReactNode;
  onSubmit: () => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  className?: string;
}

export function AdminForm({
  title,
  children,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  className,
}: AdminFormProps) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {submitLabel}
          </button>
        </div>
      </div>
      {children}
    </form>
  );
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({ label, required, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

export function FormInput({
  label,
  required,
  ...props
}: FormFieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const { children: _, ...inputProps } = props;
  return (
    <FormField label={label} required={required}>
      <input
        {...inputProps}
        required={required}
        className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </FormField>
  );
}

export function FormTextarea({
  label,
  required,
  rows = 4,
  ...props
}: FormFieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { children: _, ...textareaProps } = props;
  return (
    <FormField label={label} required={required}>
      <textarea
        {...textareaProps}
        required={required}
        rows={rows}
        className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      />
    </FormField>
  );
}
