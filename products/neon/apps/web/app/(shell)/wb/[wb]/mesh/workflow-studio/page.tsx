"use client";

import { GitPullRequestArrow, Loader2, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import { useLifecycleList } from "@/lib/schema-manager/use-lifecycles";

export default function WorkflowStudioPage() {
  const { wb } = useParams<{ wb: string }>();
  const { lifecycles, loading, error, refresh } = useLifecycleList();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !code.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/mesh/lifecycle", {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: name.trim(), code: code.trim() }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setName("");
        setCode("");
        refresh();
      }
    } finally {
      setCreating(false);
    }
  }, [name, code, refresh]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Workflow Studio
          </h2>
          <p className="text-sm text-muted-foreground">
            Design and manage lifecycle state machines for your entities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-3.5" />
            Create Lifecycle
          </Button>
        </div>
      </div>

      {lifecycles.length === 0 ? (
        <EmptyState
          icon={GitPullRequestArrow}
          title="No lifecycles"
          description="Create your first lifecycle to define state machines for entity workflows."
          actionLabel="Create Lifecycle"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lifecycles.map((lc) => (
            <Link
              key={lc.id}
              href={`/wb/${wb}/mesh/workflow-studio/${encodeURIComponent(lc.id)}`}
            >
              <Card className="group h-full transition-all hover:shadow-md hover:border-foreground/20">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="rounded-lg bg-muted p-2.5 transition-colors group-hover:bg-primary/10">
                      <GitPullRequestArrow className="size-5 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <Badge
                      variant={lc.isActive ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {lc.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{lc.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {lc.code}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{lc.stateCount} states</span>
                    <span>{lc.transitionCount} transitions</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Lifecycle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Name</label>
              <Input
                placeholder="e.g., Document Review"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Code</label>
              <Input
                placeholder="e.g., document_review"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !name.trim() || !code.trim()}
            >
              {creating && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
