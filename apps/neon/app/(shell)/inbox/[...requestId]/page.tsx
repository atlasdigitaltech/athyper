import { InboxClient } from "../InboxClient";

export default async function SelectedInboxRoute({
  params,
}: {
  params: Promise<{ requestId: string[] }>;
}) {
  const { requestId } = await params;
  return <InboxClient selectedId={requestId.join("/")} />;
}
