"use client";

import { setBffClientPlane } from "@athyper/runtime-shared/client";
import { PLANE_KEY } from "@/lib/plane";

// Belt-and-braces: providers.tsx also calls this. Either path through the app
// will initialise the plane before any csrf cookie read.
setBffClientPlane(PLANE_KEY);

export {
  getCsrfToken,
  bffFetch,
  csrfFetch,
  relayMutate,
  BffError,
  type BffFetchOptions,
} from "@athyper/runtime-shared/client";
