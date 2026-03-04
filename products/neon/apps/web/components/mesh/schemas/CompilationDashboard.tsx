"use client";

import {
  Check,
  Cog,
  Copy,
  FileJson,
  Loader2,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useState } from "react";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { MonacoViewer } from "@/components/mesh/shared/MonacoViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEntityCompiled } from "@/lib/schema-manager/use-entity-compiled";

interface CompilationDashboardProps {
  entityName: string;
}

export function CompilationDashboard({
  entityName,
}: CompilationDashboardProps) {
  const { compiled, loading, error, refresh, recompile, recompiling } =
    useEntityCompiled(entityName);
  const [copied, setCopied] = useState(false);
  const [viewTab, setViewTab] = useState("json");

  const handleCopyHash = useCallback(async () => {
    if (!compiled) return;
    await navigator.clipboard.writeText(compiled.compiledHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [compiled]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-[400px] rounded-md" />
      </div>
    );
  }

  if (error && !compiled) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!compiled) {
    return (
      <EmptyState
        icon={Cog}
        title="Not compiled yet"
        description="Compile this entity version to generate a runtime-optimized snapshot."
        actionLabel="Compile Now"
        onAction={recompile}
      />
    );
  }

  const jsonContent = JSON.stringify(compiled.compiledJson, null, 2);
  const formattedDate = new Date(compiled.generatedAt).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Compiled Snapshot</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={recompile}
            disabled={recompiling}
            className="gap-1.5"
          >
            {recompiling ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Compiling...
              </>
            ) : (
              <>
                <Cog className="size-3.5" />
                Recompile
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Status card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-success" />
              <span className="text-sm font-medium">Up to date</span>
            </div>

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Hash: </span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {compiled.compiledHash.slice(0, 12)}...
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-6 w-6 p-0"
                onClick={handleCopyHash}
              >
                {copied ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Copy className="size-3" />
                )}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Generated: </span>
              {formattedDate}
            </div>

            <Badge variant="secondary" className="text-xs font-mono">
              {(jsonContent.length / 1024).toFixed(1)} KB
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Code viewer */}
      <Tabs value={viewTab} onValueChange={setViewTab}>
        <TabsList variant="line">
          <TabsTrigger value="json" className="gap-1.5">
            <FileJson className="size-3.5" />
            JSON Snapshot
          </TabsTrigger>
          <TabsTrigger value="sql" className="gap-1.5">
            <TerminalSquare className="size-3.5" />
            SQL Fragments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="json" className="mt-4">
          <MonacoViewer value={jsonContent} language="json" height="500px" />
        </TabsContent>

        <TabsContent value="sql" className="mt-4">
          <MonacoViewer
            value={extractSqlFragments(compiled.compiledJson)}
            language="sql"
            height="500px"
          />
        </TabsContent>
      </Tabs>

      {error && (
        <div className="rounded-md border border-warning bg-warning/10 p-3 text-xs text-warning">
          {error}
        </div>
      )}
    </div>
  );
}

function extractSqlFragments(compiledJson: Record<string, unknown>): string {
  const fragments: string[] = [];

  const selectFragment = compiledJson.selectFragment;
  if (typeof selectFragment === "string") {
    fragments.push("-- SELECT fragment", selectFragment, "");
  }

  const fromFragment = compiledJson.fromFragment;
  if (typeof fromFragment === "string") {
    fragments.push("-- FROM fragment", fromFragment, "");
  }

  const whereFragment = compiledJson.whereFragment;
  if (typeof whereFragment === "string") {
    fragments.push("-- WHERE fragment", whereFragment, "");
  }

  const indexes = compiledJson.indexes;
  if (Array.isArray(indexes) && indexes.length > 0) {
    fragments.push("-- Index definitions");
    for (const idx of indexes) {
      if (typeof idx === "string") fragments.push(idx);
    }
  }

  if (fragments.length === 0) {
    fragments.push("-- No SQL fragments available in this compiled snapshot.");
    fragments.push(
      "-- Compile with SQL generation enabled to see fragments here.",
    );
  }

  return fragments.join("\n");
}
