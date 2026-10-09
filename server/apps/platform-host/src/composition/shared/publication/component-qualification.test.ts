import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import {
  createDeployedComponentQualification,
  createDeployedComponentArtifactQualification,
} from "./component-qualification.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "entity-components-"));
  roots.push(root);
  const source = {
    schema: "entity.ui-component-resource/1",
    declaration: {
      id: "00000000-0000-4000-8000-000000000001",
      tenantId: null,
      componentKey: "fixture.text",
      componentVersion: 1,
      componentLevel: "field_display",
      componentTier: "standard",
      resourceOwner: "platform",
      resourceNamespace: "entity.ui",
      publicationResourceKey: "fixture.text",
      supportedDataTypes: ["string"],
      supportedPlanes: ["studio"],
      supportedSurfaceKinds: ["list"],
      supportedModes: [],
      cardinalities: ["one"],
      optionKeys: [],
      filterOperators: [],
      compatibleDisplayIds: [],
      maskedRepresentationSafe: false,
    },
    implementation: {
      packageName: "fixture",
      exportName: "Text",
      runtimeKey: "text",
      sourceHash: "a".repeat(64),
    },
  };
  const bundle = Buffer.from("test-only deployed bytes");
  await writeFile(join(root, "bundle.js"), bundle);
  const document = {
    schema: "entity.component-deployment/1",
    plane: "studio",
    components: [source],
    files: [{ path: "bundle.js", sha256: sha256(bundle) }],
  };
  const env = {
    PUBLICATION_COMPONENT_DEPLOYMENT_ROOT: root,
    PUBLICATION_COMPONENT_DEPLOYMENT_MANIFEST: "manifest.json",
    PUBLICATION_COMPONENT_DEPLOYMENT_HASH: "",
  };
  const save = async () => {
    await writeFile(join(root, "manifest.json"), JSON.stringify(document));
    env.PUBLICATION_COMPONENT_DEPLOYMENT_HASH = sha256(
      canonicalBytes(document),
    );
  };
  await save();
  return {
    root,
    source,
    document,
    env,
    save,
    qualify: () =>
      createDeployedComponentQualification(env, { canonicalBytes, sha256 })!,
  };
}
it("qualifies only the exact deployment-pinned source and rechecks installed files", async () => {
  const f = await fixture(),
    qualify = f.qualify();
  await qualify(f.source);
  await writeFile(join(f.root, "bundle.js"), "changed");
  await expect(qualify(f.source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_FILE_CHANGED",
  );
});
it("rejects declaration escalation and changed implementation hashes", async () => {
  const f = await fixture();
  for (const source of [
    {
      ...f.source,
      declaration: { ...f.source.declaration, maskedRepresentationSafe: true },
    },
    {
      ...f.source,
      implementation: {
        ...f.source.implementation,
        sourceHash: "b".repeat(64),
      },
    },
  ])
    await expect(f.qualify()(source)).rejects.toThrow(
      "COMPONENT_DEPLOYMENT_BINDING_MISMATCH",
    );
});
it("rejects manifest replacement even when its files are internally consistent", async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, "manifest.json"),
    JSON.stringify({ ...f.document, plane: "neon" }),
  );
  await expect(f.qualify()(f.source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_MANIFEST_CHANGED",
  );
});
it("rejects paths outside deployment root, including symlinks", async () => {
  const f = await fixture();
  for (const path of ["../bundle.js", "/tmp/bundle.js"]) {
    f.document.files[0]!.path = path;
    await f.save();
    await expect(f.qualify()(f.source)).rejects.toThrow(
      "COMPONENT_DEPLOYMENT_PATH_INVALID",
    );
  }
  const other = await fixture();
  await symlink(join(other.root, "bundle.js"), join(f.root, "escape.js"));
  f.document.files[0]!.path = "escape.js";
  await f.save();
  await expect(f.qualify()(f.source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_PATH_INVALID",
  );
});
it("rejects duplicate registrations/files and unqualified planes", async () => {
  const f = await fixture();
  f.document.components.push(f.source);
  await f.save();
  await expect(f.qualify()(f.source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_BINDING_MISMATCH",
  );
  f.document.components.pop();
  f.document.files.push(f.document.files[0]!);
  await f.save();
  await expect(f.qualify()(f.source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_FILE_INVALID",
  );
  f.document.files.pop();
  f.source.declaration.supportedPlanes.push("neon");
  await f.save();
  await expect(f.qualify()(f.source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_PLANE_UNQUALIFIED",
  );
});
it("absent configuration remains disabled; partial configuration rejects", () => {
  expect(
    createDeployedComponentQualification({}, { canonicalBytes, sha256 }),
  ).toBeUndefined();
  expect(() =>
    createDeployedComponentQualification(
      { PUBLICATION_COMPONENT_DEPLOYMENT_ROOT: "/tmp" },
      { canonicalBytes, sha256 },
    ),
  ).toThrow("COMPONENT_DEPLOYMENT_CONFIGURATION_INVALID");
});

it("production artifact composition unwraps the envelope and retains deployment validation", async () => {
  const f = await fixture();
  const adapter = createDeployedComponentArtifactQualification(f.env, {
    canonicalBytes,
    sha256,
  });
  await adapter.qualify({ payload: f.source });
  await writeFile(join(f.root, "bundle.js"), "changed");
  await expect(adapter.qualify({ payload: f.source })).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_FILE_CHANGED",
  );
  expect(() =>
    createDeployedComponentArtifactQualification(
      {},
      { canonicalBytes, sha256 },
    ),
  ).toThrow("CONFIGURATION_REQUIRED");
});

it("requires each advertised plane's pinned bundle and rechecks destination bytes", async () => {
  const f = await fixture();
  f.source.declaration.supportedPlanes = ["studio", "neon", "mesh"];
  const deployments = [];
  for (const plane of ["studio", "neon", "mesh"]) {
    const content = Buffer.from(`test bundle for ${plane}`),
      path = `${plane}.js`;
    await writeFile(join(f.root, path), content);
    deployments.push({ plane, files: [{ path, sha256: sha256(content) }] });
  }
  const manifest = {
    schema: "entity.component-deployment/2",
    components: [f.source],
    deployments,
  };
  const save = async () => {
    await writeFile(join(f.root, "manifest.json"), JSON.stringify(manifest));
    f.env.PUBLICATION_COMPONENT_DEPLOYMENT_HASH = sha256(
      canonicalBytes(manifest),
    );
  };
  await save();
  await f.qualify()(f.source);
  const removed = deployments.pop()!;
  await save();
  await expect(f.qualify()(f.source)).rejects.toThrow("PLANE_UNQUALIFIED");
  deployments.push(removed);
  await save();
  await writeFile(join(f.root, "mesh.js"), "changed mesh bytes");
  await expect(f.qualify()(f.source)).rejects.toThrow("FILE_CHANGED");
});

it("checks every file across bounded batches and detects later corruption on replay", async () => {
  const f = await fixture();
  for (let i = 0; i < 11; i++) {
    const path = `part-${i}.js`,
      content = Buffer.from(`part ${i}`);
    await writeFile(join(f.root, path), content);
    f.document.files.push({ path, sha256: sha256(content) });
  }
  await f.save();
  const qualify = f.qualify();
  await qualify(f.source);
  await writeFile(join(f.root, "part-10.js"), "changed");
  await expect(qualify(f.source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_FILE_CHANGED",
  );
});
