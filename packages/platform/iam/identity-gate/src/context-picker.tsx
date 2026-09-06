"use client";

import { sanitizeReturnTo as safeReturnTo } from "@athyper/platform-iam-session";
import * as React from "react";
import { ChevronRightIcon } from "@athyper/platform-icons";
import { Notice, SelectionCard, StatusBadge } from "@athyper/platform-ui/presentation";

export interface IdentityContextOption {
  readonly tenantId: string;
  readonly tenantCode: string;
  readonly tenantName: string;
  readonly principalId: string;
  readonly description?: string;
  readonly badges?: readonly string[];
}

export function IdentityContextPicker({ contexts, returnTo = "/" }: { readonly contexts: readonly IdentityContextOption[]; readonly returnTo?: string }) {
  const [pending, setPending] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const destination = safeReturnTo(returnTo);
  async function activate(context: IdentityContextOption) {
    setPending(context.tenantId); setError(undefined);
    try {
      const csrf = readCookie("__Host-athyper-csrf") ?? readCookie("athyper-csrf");
      const response = await fetch("/api/auth/session/context", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: JSON.stringify({ tenantId: context.tenantId }) });
      if (!response.ok) throw new Error("This context is no longer available. Refresh and choose again.");
      window.location.replace(destination);
    } catch (cause) { setPending(undefined); setError(cause instanceof Error ? cause.message : "Context activation failed."); }
  }
  return <div className="a-context-picker">
    {error ? <Notice title="Context could not be opened" role="alert">{error}</Notice> : null}
    <div className="a-context-list" role="list" aria-label="Available authorized contexts">
      {contexts.map((context) => <SelectionCard disabled={Boolean(pending)} key={context.tenantId} onClick={() => void activate(context)} role="listitem">
        <span className="a-context-monogram" aria-hidden="true">{initials(context.tenantName)}</span>
        <span className="a-context-copy"><strong>{pending === context.tenantId ? "Opening securely…" : context.tenantName}</strong><span>{context.description ?? context.tenantCode}</span>{context.badges?.length ? <span className="a-context-badges">{context.badges.map((badge) => <StatusBadge key={badge}>{badge}</StatusBadge>)}</span> : null}</span>
        <span className="a-context-open" aria-hidden="true">Open <ChevronRightIcon /></span>
      </SelectionCard>)}
    </div>
  </div>;
}

function readCookie(name: string): string | undefined {
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function initials(value: string): string { const words=value.trim().split(/\s+/).filter(Boolean); return (words.length>1?`${words[0]?.[0]??""}${words[1]?.[0]??""}`:words[0]?.slice(0,2)??"A").toUpperCase(); }
