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
          <p className="mb-1 text-sm font-medium text-foreground">Platform Documentation</p>
          <p className="mb-6 max-w-xs text-xs text-muted-foreground">
            Guides, API references, and runbooks for the athyper platform.
          </p>
          <Button className="gap-2 text-sm">
            <ExternalLink className="h-4 w-4" /> View Documentation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
