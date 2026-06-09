"use client";

import {
  PrintPreviewModal,
  createDocServicesPrintClient,
  type PrintPreviewModalProps,
} from "@athyper/entity-print";

export const neonEntityPrintClient = createDocServicesPrintClient({
  basePath: "/api/docservices",
});

export function NeonPrintPreviewModal(props: Omit<PrintPreviewModalProps, "printClient">) {
  return <PrintPreviewModal {...props} printClient={neonEntityPrintClient} />;
}
