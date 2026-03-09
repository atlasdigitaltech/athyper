"use client";

// components/finance/admin/ReviewPackExport.tsx
//
// Phase 13: Export actions for the review pack.
// Supports structured JSON export and XLSX export of sections.

import {
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ReviewPackDTO } from "@/lib/finance/use-review-pack";
import { downloadXlsxFromRows, type StatementExportRow } from "@/lib/finance/export-xlsx";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReviewPackExportProps {
  data: ReviewPackDTO | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewPackExport({ data }: ReviewPackExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportJson = useCallback(() => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `review-pack-${data.entityCode}-P${data.periodNumber}-FY${data.fiscalYear}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data]);

  const handleExportXlsx = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      const rows: StatementExportRow[] = [];

      // Title row
      rows.push({
        values: [`Review Pack — ${data.entityCode} P${data.periodNumber} FY${data.fiscalYear}`],
        isBold: true,
      });
      rows.push({
        values: [`Assembled: ${new Date(data.assembledAt).toLocaleString()}`],
      });
      rows.push({
        values: [`Readiness: ${data.readinessScore}% | Phase: ${data.phase} | Blockers: ${data.blockers.length}`],
      });
      rows.push({ values: [""], isSeparator: true });

      // Sections
      for (const section of data.sections) {
        rows.push({
          values: [section.title],
          isBold: true,
          isUnderlined: true,
        });

        // Split body into lines for readability
        const lines = section.body.split("\n");
        for (const line of lines) {
          const trimmed = line.trimStart();
          const indent = line.length - trimmed.length;
          rows.push({
            values: [trimmed],
            indentLevel: Math.min(Math.floor(indent / 2), 3),
          });
        }
        rows.push({ values: [""], isSeparator: true });
      }

      // Action items summary
      if (data.actionItems.length > 0) {
        rows.push({ values: ["Open Action Items"], isBold: true, isUnderlined: true });
        rows.push({ values: ["Severity", "Title", "Status", "Category"], isBold: true });
        for (const item of data.actionItems) {
          rows.push({
            values: [
              item.severity?.toUpperCase() ?? "",
              item.title,
              item.status,
              item.category ?? "",
            ],
          });
        }
        rows.push({ values: [""], isSeparator: true });
      }

      // Decisions summary
      if (data.decisions.length > 0) {
        rows.push({ values: ["Decisions Recorded"], isBold: true, isUnderlined: true });
        rows.push({ values: ["Type", "Title", "Decided By", "Date"], isBold: true });
        for (const d of data.decisions) {
          rows.push({
            values: [
              d.decision_type?.toUpperCase() ?? "",
              d.title,
              d.decided_by_name ?? "",
              d.decided_at ? new Date(d.decided_at).toLocaleDateString() : "",
            ],
          });
        }
        rows.push({ values: [""], isSeparator: true });
      }

      // Top GL changes
      if (data.topGlChanges.length > 0) {
        rows.push({ values: ["Material GL Balances"], isBold: true, isUnderlined: true });
        rows.push({ values: ["Account", "Name", "Type", "Balance"], isBold: true });
        for (const gl of data.topGlChanges) {
          rows.push({
            values: [
              gl.account_code,
              gl.account_name,
              gl.account_type,
              Number(gl.balance).toLocaleString(undefined, { minimumFractionDigits: 2 }),
            ],
          });
        }
      }

      const fileName = `review-pack-${data.entityCode}-P${data.periodNumber}-FY${data.fiscalYear}`;
      downloadXlsxFromRows(fileName, `Review Pack ${data.entityCode}`, [], rows);
    } finally {
      setExporting(false);
    }
  }, [data]);

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Review Pack
        </CardTitle>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={handleExportXlsx}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
          )}
          Export XLSX
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={handleExportJson}
        >
          <FileJson className="h-3.5 w-3.5 mr-1.5" />
          Export JSON
        </Button>
      </CardContent>
    </Card>
  );
}
