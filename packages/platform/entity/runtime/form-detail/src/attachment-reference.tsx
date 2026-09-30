"use client";
import { useState } from "react";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Button } from "@athyper/platform-ui";
import { downloadAttachment } from "./attachment-download";

/** Metadata selects the action; the attachment service reauthorizes every click. */
export function AttachmentReference({ value }: { readonly value: unknown }) {
  const client = useApiClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (typeof value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) return <>—</>;
  return <span>
    <Button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setFailed(false);
      try { await downloadAttachment(client, value); }
      catch { setFailed(true); }
      finally { setBusy(false); }
    }}>{busy ? "Preparing download…" : "Download document"}</Button>
    {failed && <span role="alert">The document could not be downloaded. Your access or the document may have changed. Please retry.</span>}
  </span>;
}
