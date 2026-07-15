// GET|POST /api/auth/discovery — resolve org/tenant context for an email so the login gate can route to the correct IdP.
import {
  createDiscoveryGetHandler,
  createDiscoveryPostHandler,
} from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createDiscoveryGetHandler(PLANE_KEY);
export const POST = createDiscoveryPostHandler(PLANE_KEY);
