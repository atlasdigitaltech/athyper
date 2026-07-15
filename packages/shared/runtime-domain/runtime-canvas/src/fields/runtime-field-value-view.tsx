"use client";

import { Component, useMemo, type ReactNode } from "react";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import {
  adaptField,
  formatFieldValue,
  readRecordValue,
  type FieldRecord,
} from "@athyper/runtime-shared/meta-entity";
import { resolveFieldRenderer } from "./registry";

interface RuntimeFieldValueViewProps {
  field: MetaEntityField;
  record: FieldRecord;
  sourceEntityCode?: string;
}

export function RuntimeFieldValueView({ field, record, sourceEntityCode }: RuntimeFieldValueViewProps) {
  const adaptedField = useMemo(() => adaptField(field), [field]);
  const value = readRecordValue(record, field);
  const fallback = formatFieldValue(record, field);

  return (
    <FieldRendererErrorBoundary fallback={fallback}>
      <ResolvedFieldRenderer
        adaptedField={adaptedField}
        value={value}
        record={record}
        sourceEntityCode={sourceEntityCode}
      />
    </FieldRendererErrorBoundary>
  );
}

interface ResolvedFieldRendererProps {
  adaptedField: ReturnType<typeof adaptField>;
  value: unknown;
  record: FieldRecord;
  sourceEntityCode?: string;
}

function ResolvedFieldRenderer({ adaptedField, value, record, sourceEntityCode }: ResolvedFieldRendererProps) {
  const Renderer = resolveFieldRenderer(adaptedField);
  return (
    <Renderer
      value={value}
      field={adaptedField}
      mode="view"
      sourceEntityCode={sourceEntityCode}
      rowData={record}
    />
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class FieldRendererErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return <>{this.props.fallback}</>;
    }
    return this.props.children;
  }
}
