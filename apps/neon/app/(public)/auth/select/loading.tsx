import { BrandedAuthLoader } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function Loading() {
  return (
    <BrandedAuthLoader
      plane={PLANE_KEY}
      message="Loading your organizations…"
      longWaitMessage="Your available workspaces are taking longer to load."
    />
  );
}
