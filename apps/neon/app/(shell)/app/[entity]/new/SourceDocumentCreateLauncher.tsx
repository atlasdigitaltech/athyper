import Link from "next/link";

export function SourceDocumentCreateLauncher({
  entity,
  sourceEntity,
  operation,
}: {
  entity: string;
  sourceEntity?: string;
  operation?: { key: string; label?: string | null; href: string };
}) {
  const sourceLabel = sourceEntity ? humanizeEntity(sourceEntity) : "an eligible source document";
  const sourceHref = sourceEntity ? `/app/${encodeURIComponent(sourceEntity)}` : operation?.href ?? "/dashboard";

  return (
    <main className="flex min-h-[40vh] items-center justify-center px-6">
      <section className="max-w-xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Source document required
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          This document is created from a source
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {entity} uses the declared {operation?.label ?? operation?.key ?? "source-document"} operation. Start it from {sourceLabel} so lines,
          quantities, and concurrency checks are established before the draft is opened.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href={sourceHref}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {sourceEntity ? `Go to ${sourceLabel}` : operation ? `Start ${operation.label ?? operation.key}` : "Go to Dashboard"}
          </Link>
        </div>
      </section>
    </main>
  );
}

function humanizeEntity(value: string): string {
  return value
    .replace(/-/g, "_")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
