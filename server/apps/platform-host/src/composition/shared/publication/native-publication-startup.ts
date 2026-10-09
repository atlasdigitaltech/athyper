import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { Kysely } from "kysely";
import { createNativeReviewSource } from "../../control-plane/native-review-source.js";
import type { ComponentLoaderOptions } from "./active-component-source.js";
import type { AuthoringServiceOptions } from "@athyper/server-plane-studio-meta-entity-authoring";

/** Production host composition for native publication. Configuration is a private
 * deployment file, not request data or a source of publication authority. The SQL
 * reader requires the current enrolled workload for each locked source read. */
export function createNativePublicationStartup(options: {
  environment: NodeJS.ProcessEnv;
  loader: ComponentLoaderOptions;
  targetDatabases?: Partial<
    Record<"neon" | "mesh", Kysely<Record<string, never>>>
  >;
  run<T>(work: (tx: Kysely<Record<string, never>>) => Promise<T>): Promise<T>;
}): Pick<AuthoringServiceOptions, "nativePublicationSource"> & {
  readNativeSource?: ReturnType<typeof createNativeReviewSource>;
} {
  const path = options.environment.PUBLICATION_NATIVE_SOURCE_CONFIGURATION_FILE;
  if (path === undefined) return {};
  if (!isAbsolute(path))
    throw Error("NATIVE_PUBLICATION_CONFIGURATION_INVALID");
  const info = statSync(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 65536)
    throw Error("NATIVE_PUBLICATION_CONFIGURATION_INVALID");
  if (!options.loader.uiComponents)
    throw Error("NATIVE_PUBLICATION_COMPONENT_QUALIFICATION_REQUIRED");
  const source = createNativeReviewSource({
    configuration: JSON.parse(readFileSync(path, "utf8")),
    loader: options.loader,
    authority: "publication-worker",
    targetDatabases: options.targetDatabases,
  });
  return {
    readNativeSource: source,
    nativePublicationSource: (id) => options.run((tx) => source(tx, id)),
  };
}
