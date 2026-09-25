import type { HttpClient } from "@athyper/platform-api-client";
import { attachmentCapabilityUrl } from "@athyper/platform-communications-collaboration-ui";
import { attachmentDownload } from "./collaboration-operations";

/** Server-controlled attachment disposition handles cross-origin downloads. */
export async function downloadAttachment(
  client: HttpClient,
  attachmentId: string,
): Promise<void> {
  const result = await client.request(attachmentDownload(attachmentId), {
    body: { expirySeconds: 120 },
  });
  const url = attachmentCapabilityUrl(result.url);
  const anchor = document.createElement("a");
  anchor.href = url.href;
  anchor.download = "";
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.referrerPolicy = "no-referrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
