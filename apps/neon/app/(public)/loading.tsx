import { PlanePublicLoading } from "@athyper/app-foundation";
import { PLANE_KEY } from "@/lib/plane";

export default function Loading() {
  return <PlanePublicLoading plane={PLANE_KEY} />;
}
