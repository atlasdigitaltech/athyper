import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  parseUiComponentResourceSource,
  type UiComponentResourceSource,
} from "@athyper/server-contract-meta-entity-authoring";
import type { PublicationCanonicalizer } from "@athyper/server-contract-publication";

export type ComponentQualifier = (source: unknown) => Promise<void>;
/** Deployment configuration, never request data. The pinned manifest attests the
 * implementation/capability mapping; human resource review is still independent. */
export function createDeployedComponentQualification(
  environment: NodeJS.ProcessEnv,
  canonical: PublicationCanonicalizer,
): ComponentQualifier | undefined {
  const root = environment.PUBLICATION_COMPONENT_DEPLOYMENT_ROOT;
  const manifest = environment.PUBLICATION_COMPONENT_DEPLOYMENT_MANIFEST;
  const pin = environment.PUBLICATION_COMPONENT_DEPLOYMENT_HASH;
  if (root === undefined && manifest === undefined && pin === undefined)
    return undefined;
  if (
    !root ||
    !isAbsolute(root) ||
    !manifest ||
    !pin ||
    !/^[a-f0-9]{64}$/.test(pin)
  )
    throw Error("COMPONENT_DEPLOYMENT_CONFIGURATION_INVALID");
  const digest = (value: unknown) =>
    canonical.sha256(canonical.canonicalBytes(value));
  async function bytes(path: string) {
    if (!path || isAbsolute(path) || path.split(/[\\/]/).includes(".."))
      throw Error("COMPONENT_DEPLOYMENT_PATH_INVALID");
    const base = await realpath(root!);
    const file = await realpath(resolve(base, path));
    const child = relative(base, file);
    if (
      !child ||
      child === ".." ||
      child.startsWith(".." + sep) ||
      isAbsolute(child)
    )
      throw Error("COMPONENT_DEPLOYMENT_PATH_INVALID");
    const info = await stat(file);
    if (!info.isFile() || info.size > 64 * 1024 * 1024)
      throw Error("COMPONENT_DEPLOYMENT_FILE_INVALID");
    return readFile(file);
  }
  return async (input) => {
    const source = parseUiComponentResourceSource(input);
    const document: unknown = JSON.parse(
      (await bytes(manifest)).toString("utf8"),
    );
    if (digest(document) !== pin)
      throw Error("COMPONENT_DEPLOYMENT_MANIFEST_CHANGED");
    const object = (v: unknown): Record<string, unknown> => {
      if (!v || typeof v !== "object" || Array.isArray(v))
        throw Error("COMPONENT_DEPLOYMENT_MANIFEST_INVALID");
      return v as Record<string, unknown>;
    };
    const data = object(document);
    if (
      Object.keys(data).sort().join() !== "components,files,plane,schema" ||
      data.schema !== "entity.component-deployment/1" ||
      data.plane !== "studio" ||
      !Array.isArray(data.components) ||
      !data.components.length ||
      data.components.length > 256 ||
      !Array.isArray(data.files) ||
      !data.files.length ||
      data.files.length > 10000
    )
      throw Error("COMPONENT_DEPLOYMENT_MANIFEST_INVALID");
    const components: UiComponentResourceSource[] = data.components.map(
      parseUiComponentResourceSource,
    );
    const keys = components.map((c) => c.declaration.id);
    if (
      new Set(keys).size !== keys.length ||
      components.filter((c) => digest(c) === digest(source)).length !== 1
    )
      throw Error("COMPONENT_DEPLOYMENT_BINDING_MISMATCH");
    if (source.declaration.supportedPlanes.some((p) => p !== "studio"))
      throw Error("COMPONENT_DEPLOYMENT_PLANE_UNQUALIFIED");
    const paths = new Set<string>();
    // Re-read every invocation: a changed installed bundle cannot retain qualification
    // merely because this process previously approved the same metadata declaration.
    let totalBytes = 0;
    for (const item of data.files) {
      const file = object(item);
      if (
        Object.keys(file).sort().join() !== "path,sha256" ||
        typeof file.path !== "string" ||
        typeof file.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        paths.has(file.path)
      )
        throw Error("COMPONENT_DEPLOYMENT_FILE_INVALID");
      paths.add(file.path);
      const content = await bytes(file.path);
      totalBytes += content.length;
      if (totalBytes > 256 * 1024 * 1024)
        throw Error("COMPONENT_DEPLOYMENT_BUDGET_EXCEEDED");
      if (canonical.sha256(content) !== file.sha256)
        throw Error("COMPONENT_DEPLOYMENT_FILE_CHANGED");
    }
  };
}

/** Artifact loaders supply an envelope; source qualification consumes its payload. */
export function createDeployedComponentArtifactQualification(
  environment: NodeJS.ProcessEnv,
  canonical: PublicationCanonicalizer,
) {
  const qualify = createDeployedComponentQualification(environment, canonical);
  if (!qualify)
    throw Error("NATIVE_COMPONENT_DEPLOYMENT_CONFIGURATION_REQUIRED");
  return {
    qualify: async (envelope: { payload: unknown }) =>
      qualify(envelope.payload),
  };
}
