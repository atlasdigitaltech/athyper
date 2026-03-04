"use client";

import { Play, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useCallback, useState } from "react";

import type {
  ValidationRule,
  ValidationTestResult,
} from "@/lib/schema-manager/use-entity-validation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CHECK_STATUS_COLOR } from "@/lib/semantic-colors";

// ─── Props ───────────────────────────────────────────────────

interface ValidationTestPanelProps {
  rules: ValidationRule[];
  onTest: (
    payload: Record<string, unknown>,
    rules?: ValidationRule[],
    trigger?: string,
  ) => Promise<ValidationTestResult>;
}

// ─── Component ───────────────────────────────────────────────

export function ValidationTestPanel({
  rules,
  onTest,
}: ValidationTestPanelProps) {
  const [payload, setPayload] = useState("{\n  \n}");
  const [trigger, setTrigger] = useState("create");
  const [result, setResult] = useState<ValidationTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const runTest = useCallback(async () => {
    setParseError(null);
    setResult(null);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setParseError("Invalid JSON payload");
      return;
    }

    setTesting(true);
    try {
      const testResult = await onTest(parsed, rules, trigger);
      setResult(testResult);
    } finally {
      setTesting(false);
    }
  }, [payload, trigger, rules, onTest]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Test Payload</h3>
        <div className="flex items-center gap-2">
          <Select value={trigger} onValueChange={setTrigger}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="create" className="text-xs">
                Create
              </SelectItem>
              <SelectItem value="update" className="text-xs">
                Update
              </SelectItem>
              <SelectItem value="transition" className="text-xs">
                Transition
              </SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={runTest} disabled={testing}>
            <Play className="mr-1 h-3 w-3" />
            {testing ? "Testing…" : "Run Test"}
          </Button>
        </div>
      </div>

      <Textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder='{ "field_name": "value" }'
        className="min-h-[120px] font-mono text-xs"
      />

      {parseError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          {parseError}
        </div>
      )}

      {result && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {result.valid ? (
                <>
                  <CheckCircle
                    className={`h-4 w-4 ${CHECK_STATUS_COLOR.passed}`}
                  />
                  <span
                    className={`text-sm font-medium ${CHECK_STATUS_COLOR.passed}`}
                  >
                    All rules passed
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    {result.errors.length} error
                    {result.errors.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
              {result.warnings.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-warning border-warning"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {result.warnings.length} warning
                  {result.warnings.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {/* Errors */}
            {result.errors.map((err, i) => (
              <div
                key={`err-${i}`}
                className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="destructive"
                    className="text-[10px] px-1.5 py-0"
                  >
                    ERROR
                  </Badge>
                  <span className="font-mono text-muted-foreground">
                    {err.fieldPath}
                  </span>
                  <span className="text-muted-foreground">—</span>
                  <span className="font-medium">{err.ruleName}</span>
                </div>
                <p className="mt-1 text-destructive">{err.message}</p>
              </div>
            ))}

            {/* Warnings */}
            {result.warnings.map((warn, i) => (
              <div
                key={`warn-${i}`}
                className="rounded border border-warning/30 bg-warning/10 p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 text-warning border-warning"
                  >
                    WARN
                  </Badge>
                  <span className="font-mono text-muted-foreground">
                    {warn.fieldPath}
                  </span>
                  <span className="text-muted-foreground">—</span>
                  <span className="font-medium">{warn.ruleName}</span>
                </div>
                <p className="mt-1 text-warning">{warn.message}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
