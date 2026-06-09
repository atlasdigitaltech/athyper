"use client";

import { useMemo, useRef, useCallback } from "react";
import { Printer, Download, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@athyper/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@athyper/ui/primitives";
import { Button } from "@athyper/ui/primitives";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { EntityPrintConfig } from "@athyper/runtime-contracts";
import { resolveEntityPrintSections } from "../core/resolveEntityPrintSections";
import { resolvePrintIdentity } from "../core/print-identity";
import { PrintTemplateRegistry } from "../core/PrintTemplateRegistry";
import { EntityPrintTemplate } from "../templates/EntityPrintTemplate";
import { usePrintEntity, type EntityPrintClient } from "../hooks/usePrintEntity";

export interface PrintPreviewModalProps {
  open:       boolean;
  onClose:    () => void;
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown> };
  entityCode: string;
  tenantName?: string;
  printClient?: EntityPrintClient;
}

const A4_PREVIEW_STYLE: React.CSSProperties = {
  width:      "794px",
  minHeight:  "1123px",
  background: "#fff",
  boxShadow:  "0 4px 24px rgba(0,0,0,0.12)",
  overflow:   "hidden",
  flexShrink: 0,
};

export function PrintPreviewModal({
  open,
  onClose,
  entity,
  record,
  entityCode,
  tenantName = "",
  printClient,
}: PrintPreviewModalProps) {
  const printRootRef = useRef<HTMLDivElement>(null);

  const { profiles, effectiveProfile, setSelectedProfile, downloadPdf, isDownloading, downloadError, clearError } =
    usePrintEntity(entityCode, record.id, { client: printClient });

  const sections = useMemo(
    () => resolveEntityPrintSections(entity),
    [entity],
  );

  const identity = useMemo(
    () => {
      const displayConfig = entity.display_config as Record<string, unknown> | undefined;
      const printConfig   = displayConfig?.["print_config"] as EntityPrintConfig | undefined;
      return resolvePrintIdentity(entity, record.data as Record<string, unknown>, printConfig);
    },
    [entity, record.data],
  );

  const printedAt = new Date().toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const ResolvedTemplate = PrintTemplateRegistry.resolve(entityCode) ?? EntityPrintTemplate;

  const handleWindowPrint = useCallback(() => {
    const el = printRootRef.current;
    if (!el) return;
    el.style.display = "block";
    window.print();
    el.style.display = "none";
  }, []);

  const handleClose = useCallback(() => {
    clearError();
    onClose();
  }, [clearError, onClose]);

  return (
    <>
      {/* Hidden print root — shown only during window.print() */}
      <div ref={printRootRef} style={{ display: "none" }} aria-hidden>
        <ResolvedTemplate
          entity={entity}
          record={record}
          identity={identity}
          sections={sections}
          tenantName={tenantName}
          printedAt={printedAt}
          profile={effectiveProfile}
        />
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent
          className="max-w-[900px] w-full max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden"
          aria-label="Print preview"
          aria-describedby={undefined}
        >
          <DialogHeader className="!flex-row !items-center !justify-between !space-y-0 !text-left min-h-14 gap-3 border-b px-4 py-2 pr-14 shrink-0">
            <DialogTitle className="truncate text-base font-medium leading-tight">Print / Save PDF</DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleWindowPrint}
              >
                <Printer className="size-3.5" />
                Print
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void downloadPdf()}
                disabled={isDownloading}
              >
                <Download className="size-3.5" />
                {isDownloading ? "Generating..." : "Save PDF"}
              </Button>
            </div>
          </DialogHeader>

          {profiles.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Profile</span>
                <Select
                  value={effectiveProfile?.id ?? ""}
                  onValueChange={(v) => setSelectedProfile(v || null)}
                >
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}{p.is_default ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Error strip */}
          {downloadError && (
            <div className="flex items-center gap-2 px-5 py-2 bg-destructive/10 text-destructive text-xs shrink-0">
              <AlertCircle className="size-3.5 shrink-0" />
              {downloadError}
            </div>
          )}

          {/* Preview pane */}
          <div className="flex-1 overflow-auto bg-muted p-6 flex justify-center">
            <div style={A4_PREVIEW_STYLE}>
              <ResolvedTemplate
                entity={entity}
                record={record}
                identity={identity}
                sections={sections}
                tenantName={tenantName}
                printedAt={printedAt}
                profile={effectiveProfile}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
