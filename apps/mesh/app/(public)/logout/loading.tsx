import { BrandedAuthLoader } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function Loading() {
  return <BrandedAuthLoader plane={PLANE_KEY} message="Signing you out securely…" longWaitMessage="Sign-out is taking longer than expected." />;
}
