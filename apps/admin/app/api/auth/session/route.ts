import {
  createSessionDeleteHandler,
  createSessionGetHandler,
  createSessionPatchHandler,
} from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createSessionGetHandler(PLANE_KEY);
export const PATCH = createSessionPatchHandler(PLANE_KEY);
export const DELETE = createSessionDeleteHandler(PLANE_KEY);
