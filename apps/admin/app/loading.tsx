import { BrandedAuthLoader } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function Loading() {
  return (
    <BrandedAuthLoader
      plane={PLANE_KEY}
      message="Loading Admin…"
      longWaitMessage="Admin is taking longer than expected to load."
    />
  );
}
