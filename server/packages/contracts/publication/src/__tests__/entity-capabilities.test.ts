import { resolveSourcePath } from "../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCapabilityBinding,
  parseCapabilityDeclaration,
  projectEntityCapability,
  validateEntityCapabilities,
} from "../entity-capabilities.js";
import { parseCompiledEntityArtifact } from "../artifact.js";

const root = new URL(
  "../../../../../../metadata/entities/business_partner/",
  import.meta.url,
);
const source = (name: string) =>
  JSON.parse(readFileSync(resolveSourcePath(new URL(name, root)), "utf8"));
const bindings = () => source("operation.json");
describe("typed entity capabilities", () => {
  it.each(["studio", "neon", "mesh"])("qualifies exact common capability permissions in %s without bypassing registration", (plane) => {
    const core = source("core.json"), op = bindings();
    core.plane = op.plane = plane;
    core.capabilities.attachments = { enabled: false };
    delete op.attachmentBinding;
    const binding = op.commentBinding;
    binding.actions = [{ key: "read", permissionCode: "common.collaboration.comment.read", handlerKey: "platform.comments.read.v1", concurrency: "none", idempotency: "none" }];
    binding.features = { replies: false, edits: false, reactions: false, mentions: false, drafts: false, reporting: false, history: false };
    binding.reactionCodes = [];
    binding.attachments = { allowed: false, maxCount: 0, pinVersion: true };
    const artifacts = () => [core, op].map(parseCompiledEntityArtifact);
    const registry = {
      handlers: new Set(["platform.comments.v1", "platform.comments.read.v1"]),
      permissions: new Set(["common.collaboration.comment.read"]),
      resolvers: new Set(["platform.records.admission.v1"]),
      renderers: new Set(["platform.comments.v1"]), evaluators: new Set<string>(),
    };
    expect(() => validateEntityCapabilities(artifacts(), registry)).not.toThrow();
    registry.permissions.clear();
    expect(() => validateEntityCapabilities(artifacts(), registry)).toThrow(/unregistered/);
    registry.permissions.add("common.collaboration.comment.read");
    registry.handlers.delete("platform.comments.read.v1");
    expect(() => validateEntityCapabilities(artifacts(), registry)).toThrow(/unregistered/);
  });
  it("defaults omitted capabilities to disabled and rejects unknown normative properties", () => {
    expect(
      parseCapabilityDeclaration(undefined, "comments", "customer"),
    ).toEqual({ enabled: false });
    expect(() =>
      parseCapabilityDeclaration(
        { enabled: false, enable: true },
        "comments",
        "customer",
      ),
    ).toThrow(/unknown property/);
  });
  it("projects the same safe controls for both layouts without handlers or policy internals", () => {
    const binding = parseCapabilityBinding(
      bindings().commentBinding,
      "comments",
      "business_partner",
    );
    const safe = projectEntityCapability(
      binding,
      new Set(["neon.collaboration.comment.read"]),
    );
    expect(safe.layouts).toEqual(["drawer", "content"]);
    expect(safe.actions.map((a) => a.key)).toEqual(["read", "flag", "mention", "history"]);
    expect(JSON.stringify(safe)).not.toMatch(
      /handler|storage|permissionCode|Policy/,
    );
  });
  it.each([
    [
      "commentBinding",
      (v: any) => {
        v.maxDepth = 6;
      },
    ],
    [
      "commentBinding",
      (v: any) => {
        v.defaultAudience = "internal";
      },
    ],
    [
      "commentBinding",
      (v: any) => {
        v.allowedAudiences.push("internal");
      },
    ],
    [
      "commentBinding",
      (v: any) => {
        v.reactionCodes = ["unknown"];
      },
    ],
    [
      "commentBinding",
      (v: any) => {
        v.actions = v.actions.filter((a: any) => a.key !== "history");
      },
    ],
    [
      "commentBinding",
      (v: any) => {
        v.richTextSchema = "unsafe/1";
      },
    ],
    [
      "commentBinding",
      (v: any) => {
        v.actions[2].concurrency = "none";
      },
    ],
    [
      "commentBinding",
      (v: any) => {
        v.actions[1].idempotency = "none";
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.scanRequired = false;
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.allowedContentTypes = ["application/unknown"];
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.categories = ["unregistered"];
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.maxFileBytes = 26214401;
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.processing.search = true;
        v.processing.extraction = false;
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.duplicateBehavior = "new_version"; v.versioning = false;
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.actions[0].key = "purge_anything";
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.processing.preveiw = true;
      },
    ],
    [
      "attachmentBinding",
      (v: any) => {
        v.retentionPolicy = {
          artifactKey: "policy/latest",
          plane: "neon",
          hash: "latest",
        };
      },
    ],
  ])("rejects invalid %s policy %#", (name, mutate) => {
    const v = bindings()[name as string];
    (mutate as (v: unknown) => void)(v);
    expect(() =>
      parseCapabilityBinding(
        v,
        name === "commentBinding" ? "comments" : "attachments",
        "business_partner",
      ),
    ).toThrow();
  });
  it("validates registry/permission coverage, owner, section actions and immutable dependencies", () => {
    const core = source("core.json"),
      op = bindings(),
      section = source("presentation.section.comments.json");
    const parse = () => [core, op, section].map(parseCompiledEntityArtifact);
    const all = [...op.commentBinding.actions, ...op.attachmentBinding.actions];
    const registry = {
      handlers: new Set([
        "platform.comments.v1",
        "platform.attachments.v1",
        ...all.map((a: any) => a.handlerKey),
      ]),
      permissions: new Set<string>(all.map((a: any) => a.permissionCode)),
      resolvers: new Set(["platform.records.admission.v1"]),
      renderers: new Set(["platform.comments.v1", "platform.attachments.v1"]),
      evaluators: new Set<string>(),
    };
    expect(() => validateEntityCapabilities(parse(), registry)).not.toThrow();
    registry.handlers.delete("platform.comments.v1");
    expect(() => validateEntityCapabilities(parse(), registry)).toThrow(
      /unregistered/,
    );
    registry.handlers.add("platform.comments.v1");
    op.commentBinding.retentionPolicy = {
      artifactKey: "policy/core",
      hash: "sha256:" + "a".repeat(64),
      plane: "mesh",
    };
    expect(() => validateEntityCapabilities(parse(), registry)).toThrow(
      /same-plane/,
    );
    op.commentBinding.retentionPolicy.plane = "neon";
    expect(() => validateEntityCapabilities(parse(), registry)).toThrow(
      /dependency/,
    );
    delete op.commentBinding.retentionPolicy;
    section.availableOperations[0].permissionCode = "neon.unknown";
    expect(() => validateEntityCapabilities(parse(), registry)).toThrow(
      /contradicts/,
    );
  });
  it("allows a disabled graph but rejects retained executable bindings", () => {
    const core = source("core.json"),
      operation = bindings();
    core.capabilities.comments = { enabled: false };
    core.capabilities.attachments = { enabled: false };
    expect(() =>
      validateEntityCapabilities(
        [core, operation].map(parseCompiledEntityArtifact),
      ),
    ).toThrow(/disabled/);
    delete operation.commentBinding;
    delete operation.attachmentBinding;
    expect(() =>
      validateEntityCapabilities(
        [core, operation].map(parseCompiledEntityArtifact),
      ),
    ).not.toThrow();
  });
  it("supports a second owner without changing the contract and permits tighter limits", () => {
    const b = bindings().attachmentBinding;
    b.ownerEntityCode = "customer";
    b.maxFileBytes = 1024;
    expect(
      parseCapabilityBinding(b, "attachments", "customer").maxFileBytes,
    ).toBe(1024);
    expect(() =>
      parseCapabilityBinding(b, "attachments", "business_partner"),
    ).toThrow(/ownerEntityCode/);
  });
});

it.each([0,366,1.5,"30"])("rejects invalid draft retention %s", days=>{
  const binding=bindings().commentBinding;
  binding.draftRetentionDays=days;
  expect(()=>parseCapabilityBinding(binding,"comments","business_partner")).toThrow();
});
