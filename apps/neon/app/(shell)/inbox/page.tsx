import { InboxPage } from "@athyper/app-neon-command-hub";
import { PLANE_KEY } from "@/lib/plane";

export default function InboxRoute() {
  return <InboxPage plane={PLANE_KEY} />;
}
