"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Input, Textarea } from "@athyper/ui";

export const selectClassName = "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function EditorField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm text-foreground">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function EditorInput({
  label,
  hint,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: "text" | "number";
}) {
  return (
    <EditorField label={label} hint={hint}>
      <Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </EditorField>
  );
}

export function EditorSelect<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <EditorField label={label} hint={hint}>
      <select className={selectClassName} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
      </select>
    </EditorField>
  );
}

export function EditorNullableSelect<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
  emptyLabel = "Not set",
}: {
  label: string;
  hint?: string;
  value: T | null;
  options: readonly T[];
  onChange: (value: T | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  return (
    <EditorField label={label} hint={hint}>
      <select className={selectClassName} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value ? event.target.value as T : null)}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
      </select>
    </EditorField>
  );
}

export function EditorCheckbox({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm text-foreground">
      <input className="mt-0.5 size-4 accent-primary" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span><span className="block font-medium">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>}</span>
    </label>
  );
}

export function JsonEditor({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: unknown | null;
  onChange: (value: unknown | null) => void;
  disabled?: boolean;
}) {
  const serialized = value == null ? "" : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(serialized); setError(null); }, [serialized]);

  return (
    <EditorField label={label} hint={error ?? hint}>
      <Textarea
        className={error ? "min-h-24 border-destructive font-mono text-xs" : "min-h-24 font-mono text-xs"}
        value={draft}
        disabled={disabled}
        placeholder="Not configured"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!draft.trim()) { setError(null); onChange(null); return; }
          try { onChange(JSON.parse(draft) as unknown); setError(null); }
          catch { setError("Enter valid JSON before leaving this property."); }
        }}
      />
    </EditorField>
  );
}

export function PanelHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
      {action}
    </div>
  );
}
