import { headers } from "next/headers";
import { createProtectedAppBootstrap } from "@athyper/platform-shell-app-foundation/server";
import { auth } from "@/lib/auth";
import { platformRelay } from "@/lib/relay";
import { readAppEnvironment } from "./environment";

export const loadProtectedAppBootstrap = createProtectedAppBootstrap({
  readHeaders: async () => new Headers(await headers()),
  readOrigin: () => readAppEnvironment().appOrigin,
  readSession: (request) => auth.session(request),
  readExperience: (request) =>
    platformRelay(request, {
      params: Promise.resolve({
        path: ["platform", "experience", "bootstrap"],
      }),
    }),
});
