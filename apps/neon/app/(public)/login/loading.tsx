import { BrandedAuthLoader } from "@athyper/platform-iam-identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function Loading() {
  return (
    <BrandedAuthLoader
      plane={PLANE_KEY}
      message="Preparing secure sign-in…"
      longWaitMessage="Secure sign-in is taking longer than expected."
    />
  );
}
