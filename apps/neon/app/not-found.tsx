import { PlaneNotFound } from "@athyper/app-foundation";
import { PLANE_KEY } from "@/lib/plane";

export default function NotFound() {
  return <PlaneNotFound plane={PLANE_KEY} />;
}
