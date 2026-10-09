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
  async function bytes(base: string, path: string) {
    if (!path || isAbsolute(path) || path.split(/[\\/]/).includes(".."))
      throw Error("COMPONENT_DEPLOYMENT_PATH_INVALID");
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
    const base = await realpath(root!);
    const document: unknown = JSON.parse(
      (await bytes(base, manifest)).toString("utf8"),
    );
    if (digest(document) !== pin)
      throw Error("COMPONENT_DEPLOYMENT_MANIFEST_CHANGED");
    const object = (v: unknown): Record<string, unknown> => {
      if (!v || typeof v !== "object" || Array.isArray(v))
        throw Error("COMPONENT_DEPLOYMENT_MANIFEST_INVALID");
      return v as Record<string, unknown>;
    };
    const data = object(document);
    const multi = data.schema === "entity.component-deployment/2";
    if (
      (!multi &&
        (data.schema !== "entity.component-deployment/1" ||
          data.plane !== "studio" ||
          Object.keys(data).sort().join() !==
            "components,files,plane,schema")) ||
      (multi &&
        Object.keys(data).sort().join() !== "components,deployments,schema") ||
      !Array.isArray(data.components) ||
      !data.components.length ||
      data.components.length > 256
    )
      throw Error("COMPONENT_DEPLOYMENT_MANIFEST_INVALID");
    const deployments = multi
      ? data.deployments
      : [{ plane: data.plane, files: data.files }];
    if (
      !Array.isArray(deployments) ||
      !deployments.length ||
      deployments.length > 3
    )
      throw Error("COMPONENT_DEPLOYMENT_MANIFEST_INVALID");
    const planes = new Set<string>();
    const files: unknown[] = [];
    for (const item of deployments) {
      const deployment = object(item);
      if (
        Object.keys(deployment).sort().join() !== "files,plane" ||
        typeof deployment.plane !== "string" ||
        !["studio", "neon", "mesh"].includes(deployment.plane) ||
        planes.has(deployment.plane) ||
        !Array.isArray(deployment.files) ||
        !deployment.files.length ||
        deployment.files.length > 10000
      )
        throw Error("COMPONENT_DEPLOYMENT_MANIFEST_INVALID");
      planes.add(deployment.plane);
      const paths = deployment.files.map((file) => object(file).path);
      if (new Set(paths).size !== paths.length)
        throw Error("COMPONENT_DEPLOYMENT_FILE_INVALID");
      files.push(...deployment.files);
    }
    const components: UiComponentResourceSource[] = data.components.map(
      parseUiComponentResourceSource,
    );
    const keys = components.map((c) => c.declaration.id);
    if (
      new Set(keys).size !== keys.length ||
      components.filter((c) => digest(c) === digest(source)).length !== 1
    )
      throw Error("COMPONENT_DEPLOYMENT_BINDING_MISMATCH");
    if (source.declaration.supportedPlanes.some((p) => !planes.has(p)))
      throw Error("COMPONENT_DEPLOYMENT_PLANE_UNQUALIFIED");
    // Re-read every invocation: a changed installed bundle cannot retain qualification
    // merely because this process previously approved the same metadata declaration.
    let totalBytes = 0;
    const verify = async (item: unknown) => {
      const file = object(item);
      if (
        Object.keys(file).sort().join() !== "path,sha256" ||
        typeof file.path !== "string" ||
        typeof file.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
      )
        throw Error("COMPONENT_DEPLOYMENT_FILE_INVALID");
      const content = await bytes(base, file.path);
      totalBytes += content.length;
      if (totalBytes > 256 * 1024 * 1024)
        throw Error("COMPONENT_DEPLOYMENT_BUDGET_EXCEEDED");
      if (canonical.sha256(content) !== file.sha256)
        throw Error("COMPONENT_DEPLOYMENT_FILE_CHANGED");
    };
    // Sixteen bounded reads avoid serial filesystem latency without caching trust.
    // Await every started read, including on rejection; no work outlives the call.
    for (let offset = 0; offset < files.length; offset += 16) {
      const results = await Promise.allSettled(
        files.slice(offset, offset + 16).map(verify),
      );
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
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
