"use client";

import { ExternalLink, FileText } from "lucide-react";
import { Button, Card, CardContent } from "@athyper/ui/primitives";

export function DocsSection() {
  return (
    <div className="w-full">
      <Card className="w-full">
        <CardContent className="flex w-full flex-col items-center py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mb-1 text-sm font-semibold text-foreground">Athyper Knowledge Base</p>
          <p className="mb-6 max-w-xs text-xs text-muted-foreground">
            Access guides, API references, module documentation, and release notes.
          </p>
          <Button className="gap-2 text-sm">
            <ExternalLink className="h-4 w-4" /> Open Documentation Wiki
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
