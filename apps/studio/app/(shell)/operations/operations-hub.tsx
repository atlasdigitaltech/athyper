"use client";

import { useHasPermission } from "@athyper/platform-shell-app-foundation";
import { ContentHeader } from "@athyper/platform-shell";
import { ClipboardCheckIcon, LanguagesIcon } from "@athyper/platform-icons";

export function OperationsHub() {
  const canManageLanguages = useHasPermission("studio.platform.catalog.manage");

  return (
    <section className="studio-operations" aria-labelledby="page-title">
      <ContentHeader title="Operations" description="Configure and verify governed platform capabilities across Studio, Neon, and Mesh." />
      <div className="studio-operations__grid">
        {canManageLanguages ? (
          <a href="/operations/localization">
            <span aria-hidden="true"><LanguagesIcon /></span>
            <strong>Languages and regions</strong>
            <p>Activate supported languages and choose the default independently for each plane.</p>
            <small>Studio · Neon · Mesh</small>
          </a>
        ) : null}
        <a href="/operations/verification">
          <span aria-hidden="true"><ClipboardCheckIcon /></span>
          <strong>System verification</strong>
          <p>Inspect authenticated platform checks and operational readiness evidence.</p>
          <small>Assurance</small>
        </a>
      </div>
    </section>
  );
}
