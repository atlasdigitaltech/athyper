"use client";

import { AlertTriangle, FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { FieldDefinition } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parseCsvFields, parseJsonFields } from "@/lib/schema-manager/bulk-ops";

// ─── Types ───────────────────────────────────────────────────

type ImportFormat = "csv" | "json";

interface ParsedImport {
  fields: Partial<FieldDefinition>[];
  errors: string[];
  warnings: string[];
}

// ─── Component ───────────────────────────────────────────────

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  onImport: (fields: Partial<FieldDefinition>[]) => void;
}

export function BulkImportDialog({
  open,
  onOpenChange,
  entityName,
  onImport,
}: BulkImportDialogProps) {
  const [format, setFormat] = useState<ImportFormat>("csv");
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = useCallback(() => {
    const result: ParsedImport = { fields: [], errors: [], warnings: [] };

    try {
      if (format === "csv") {
        const { fields, errors } = parseCsvFields(rawInput);
        result.fields = fields;
        result.errors.push(...errors);
        if (fields.length === 0 && errors.length === 0) {
          result.errors.push("No fields found in CSV input");
        }
      } else {
        const { fields, errors } = parseJsonFields(rawInput);
        result.fields = fields;
        result.errors.push(...errors);
        if (fields.length === 0 && errors.length === 0) {
          result.errors.push("No fields found in JSON input");
        }
      }

      // Check for duplicate names
      const names = new Set<string>();
      for (const f of result.fields) {
        if (f.name && names.has(f.name)) {
          result.warnings.push(`Duplicate field name: '${f.name}'`);
        }
        if (f.name) names.add(f.name);
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Parse failed");
    }

    setParsed(result);
  }, [format, rawInput]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setRawInput(text);
        if (file.name.endsWith(".json")) setFormat("json");
        else setFormat("csv");
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!parsed || parsed.fields.length === 0) return;
    setImporting(true);
    try {
      onImport(parsed.fields);
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  }, [parsed, onImport, onOpenChange]);

  const handleReset = useCallback(() => {
    setRawInput("");
    setParsed(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Fields</DialogTitle>
          <DialogDescription>
            Import fields into &quot;{entityName}&quot; from CSV or JSON.
          </DialogDescription>
        </DialogHeader>

        {/* Format selector */}
        <div className="flex items-center gap-2">
          <Button
            variant={format === "csv" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setFormat("csv");
              setParsed(null);
            }}
          >
            <FileSpreadsheet className="size-3.5" />
            CSV
          </Button>
          <Button
            variant={format === "json" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setFormat("json");
              setParsed(null);
            }}
          >
            <FileJson className="size-3.5" />
            JSON
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-3.5" />
            Upload File
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Input */}
        <Textarea
          placeholder={
            format === "csv"
              ? "name,dataType,isRequired,isUnique\nunit_price,decimal,true,false\nsku,string,true,true"
              : '[{"name": "unit_price", "dataType": "decimal", "isRequired": true}]'
          }
          rows={8}
          className="font-mono text-xs"
          value={rawInput}
          onChange={(e) => {
            setRawInput(e.target.value);
            setParsed(null);
          }}
        />

        {/* Preview / Errors */}
        {parsed && (
          <div className="space-y-2">
            {parsed.errors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1">
                {parsed.errors.map((err, i) => (
                  <p
                    key={i}
                    className="text-xs text-destructive flex items-center gap-1.5"
                  >
                    <AlertTriangle className="size-3 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}

            {parsed.warnings.length > 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/5 p-3 space-y-1">
                {parsed.warnings.map((w, i) => (
                  <p
                    key={i}
                    className="text-xs text-warning flex items-center gap-1.5"
                  >
                    <AlertTriangle className="size-3 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {parsed.fields.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium">Preview</p>
                  <Badge variant="secondary" className="text-xs">
                    {parsed.fields.length} fields
                  </Badge>
                </div>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {parsed.fields.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">
                        {f.name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {f.dataType}
                      </Badge>
                      {f.isRequired && (
                        <Badge variant="secondary" className="text-[10px]">
                          required
                        </Badge>
                      )}
                      {f.isUnique && (
                        <Badge variant="secondary" className="text-[10px]">
                          unique
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleReset}>
            Clear
          </Button>
          {!parsed ? (
            <Button onClick={handleParse} disabled={!rawInput.trim()}>
              Validate
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={
                importing ||
                parsed.errors.length > 0 ||
                parsed.fields.length === 0
              }
            >
              {importing
                ? "Importing..."
                : `Import ${parsed.fields.length} Fields`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
