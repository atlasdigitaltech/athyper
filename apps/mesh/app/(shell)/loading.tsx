import { PlaneAppBootstrapSkeleton } from "@athyper/app-foundation";
import { PLANE_KEY } from "@/lib/plane";

export default function Loading() {
  return <PlaneAppBootstrapSkeleton plane={PLANE_KEY} surface="shell" />;
}
