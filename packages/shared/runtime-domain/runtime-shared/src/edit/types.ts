import type { ReactNode } from "react";

export type EntityEditSaveResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors?: Record<string, string>;
      globalError?: string;
      conflict?: {
        message: string;
        serverVersion?: string;
      };
    };

export interface EntityEditState {
  isDirty: boolean;
  dirtyFields: string[];
  isSaving: boolean;
  lastSavedAt?: string;
  justSaved?: boolean;
  save(): Promise<EntityEditSaveResult>;
  discard(): void;
}

export type EditGuardAction = "stay" | "discard" | "save_and_leave";

export interface EntityEditableField {
  name: string;
  label: string;
  hint?: string;
  editable?: boolean;
  apiField?: string;
  editableInStatus?: string[];
  editingForcesStatus?: string;
  inputType?: "text" | "textarea" | "date" | "number" | "email";
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  fieldErrors?: Record<string, string>;
  globalError?: string;
}

export type FieldRenderer = (props: {
  field: EntityEditableField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}) => ReactNode;

export type SectionRenderer = (props: {
  record: Record<string, unknown>;
  patch: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  disabled?: boolean;
}) => ReactNode;
