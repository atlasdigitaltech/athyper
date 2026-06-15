"use client";

import { useMemo } from "react";
import { PrintPreviewModal } from "@athyper/entity-print/modal";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { buildPrintPreviewEntity } from "./buildPrintPreviewEntity";

export interface PrintPreviewHostProps {
  contract: MetaEntityRuntimeDescriptor;
  entityCode: string;
  recordUuid: string | null;
  recordData: Record<string, unknown>;
  open: boolean;
  onClose: () => void;
  tenantName?: string;
}

export function PrintPreviewHost({
  contract,
  entityCode,
  recordUuid,
  recordData,
  open,
  onClose,
  tenantName,
}: PrintPreviewHostProps) {
  const entity = useMemo(() => buildPrintPreviewEntity(contract), [contract]);

  if (!open || !recordUuid) return null;

  return (
    <PrintPreviewModal
      open={open}
      onClose={onClose}
      entity={entity}
      record={{ id: recordUuid, data: recordData }}
      entityCode={entityCode}
      tenantName={tenantName}
    />
  );
}
