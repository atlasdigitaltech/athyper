import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { validatePlaneServerSession, type V4Session } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const getMeshServerSession = cache(async (): Promise<V4Session | null> => {
  const validation = await validatePlaneServerSession(PLANE_KEY, {
    cookies: await cookies(),
    headers: await headers(),
  });

  return validation.ok ? validation.session : null;
});
