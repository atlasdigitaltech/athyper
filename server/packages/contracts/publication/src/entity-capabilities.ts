import { PublicationContractError } from "./errors.js";
import type {
  CompiledEntityArtifactV2,
  CompiledEntityRegistry,
} from "./artifact.js";

export const ENTITY_CAPABILITY_VERSION = 1 as const;
export type EntityCapabilityKind = "comments" | "attachments";
export type CapabilityDeclaration =
  | { readonly enabled: false; readonly reasonCode?: string }
  | {
      readonly enabled: true;
      readonly serviceKey: string;
      readonly ownerEntityCode: string;
      readonly load: "lazy";
      readonly includeInAggregateData?: false;
    };
export interface CapabilityPolicyReference {
  readonly artifactKey: string;
  readonly hash: string;
  readonly plane: "neon" | "mesh" | "studio";
}
export interface EntityCapabilityAuthoringMember {
  readonly capabilityKey: EntityCapabilityKind;
  readonly declaration: CapabilityDeclaration;
  readonly binding?: CommentBinding | AttachmentBinding;
}
/** The sole Studio-member to split-artifact mapping; no independent surface policy. */
export function capabilityArtifactMembers(
  entityCode: string,
  members: readonly EntityCapabilityAuthoringMember[],
) {
  const capabilities: Record<string, CapabilityDeclaration> = {};
  const operationBindings: Record<string, CommentBinding | AttachmentBinding> =
    {};
  for (const member of members) {
    if (!member || !["comments", "attachments"].includes(member.capabilityKey))
      fail(entityCode, "unknown capability member");
    object(
      member,
      ["id", "capabilityKey", "declaration", "binding"],
      `${entityCode}.capabilities.${member.capabilityKey}`,
    );
    if (Object.hasOwn(capabilities, member.capabilityKey))
      fail(entityCode, "duplicate capability member");
    const declaration = parseCapabilityDeclaration(
      member.declaration,
      member.capabilityKey,
      entityCode,
    );
    capabilities[member.capabilityKey] = declaration;
    if (declaration.enabled)
      operationBindings[
        member.capabilityKey === "comments"
          ? "commentBinding"
          : "attachmentBinding"
      ] = parseCapabilityBinding(
        member.binding,
        member.capabilityKey,
        entityCode,
      );
    else if (member.binding !== undefined)
      fail(entityCode, "disabled capability has policy");
  }
  return { capabilities, operationBindings };
}
export interface CapabilityAction {
  readonly key: string;
  readonly permissionCode: string;
  readonly handlerKey: string;
  readonly concurrency: "none" | "revision";
  readonly idempotency: "none" | "required";
}
export interface CapabilityBinding {
  readonly schemaVersion: 1;
  readonly serviceKey: string;
  readonly ownerEntityCode: string;
  readonly admissionResolverKey: "platform.records.admission.v1";
  readonly actions: readonly CapabilityAction[];
  readonly layouts: readonly ("drawer" | "content")[];
  readonly retentionPolicy?: CapabilityPolicyReference;
}
export interface CommentBinding extends CapabilityBinding {
  readonly draftRetentionDays?: number;
  readonly richTextSchema: "athyper.rich-text/1.0";
  readonly maxTextLength: number;
  readonly maxDepth: number;
  readonly allowedAudiences: readonly ("public" | "private" | "internal")[];
  readonly defaultAudience: "public" | "private" | "internal";
  readonly audiencePolicy?: CapabilityPolicyReference;
  readonly features: {
    readonly replies: boolean;
    readonly edits: boolean;
    readonly reactions: boolean;
    readonly mentions: boolean;
    readonly drafts: boolean;
    readonly reporting: boolean;
    readonly history: boolean;
  };
  readonly reactionCodes: readonly string[];
  readonly attachments: {
    readonly allowed: boolean;
    readonly maxCount: number;
    readonly pinVersion: true;
    readonly bindingRef?: string;
  };
}
export interface AttachmentBinding extends CapabilityBinding {
  readonly maxFileBytes: number;
  readonly maxBatchCount: number;
  readonly allowedContentTypes: readonly string[];
  readonly scanRequired: true;
  readonly linkKinds: readonly string[];
  readonly categories: readonly string[];
  readonly folders: boolean;
  readonly versioning: boolean;
  readonly rename: boolean;
  readonly duplicateBehavior: "reject" | "new_version";
  readonly unlink: "association_only";
  readonly download: "short_lived_authorized_url";
  readonly processing: {
    readonly preview: boolean;
    readonly extraction: boolean;
    readonly search: boolean;
    readonly renditions: readonly string[];
  };
}
const kinds = ["comments", "attachments"] as const;
const base = [
  "schemaVersion",
  "serviceKey",
  "ownerEntityCode",
  "admissionResolverKey",
  "actions",
  "layouts",
  "retentionPolicy",
];
const mime = ["application/pdf", "image/jpeg", "image/png", "text/plain"];
const actions = {
  comments: [
    "read",
    "create",
    "update_own",
    "archive_own",
    "reply",
    "react",
    "draft",
    "flag",
    "history",
    "mention",
  ],
  attachments: [
    "read",
    "create",
    "finalize",
    "status",
    "download",
    "unlink",
    "archive",
    "rename",
    "version",
    "folder",
    "category",
    "preview",
    "extract",
    "search",
  ],
} as const;
function fail(path: string, message: string): never {
  throw new PublicationContractError(
    "ENTITY_CAPABILITY_INVALID",
    `${path}: ${message}`,
  );
}
function object(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "object required");
  for (const key of Object.keys(value))
    if (!keys.includes(key)) fail(`${path}.${key}`, "unknown property");
  return value as Record<string, unknown>;
}
function literal(value: unknown, expected: unknown, path: string) {
  if (value !== expected) fail(path, `must equal ${String(expected)}`);
}
function key(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(value))
    fail(path, "invalid key");
  return value;
}
function integer(value: unknown, min: number, max: number, path: string) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  )
    fail(path, `integer ${min}..${max} required`);
}
function bool(value: unknown, path: string) {
  if (typeof value !== "boolean") fail(path, "boolean required");
}
function list(
  value: unknown,
  allowed: readonly string[] | undefined,
  path: string,
  min = 1,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < min ||
    value.length > 100 ||
    new Set(value).size !== value.length ||
    value.some(
      (v) => typeof v !== "string" || (allowed && !allowed.includes(v)),
    )
  )
    fail(path, "invalid or duplicate value");
  return value as string[];
}
function reference(value: unknown, path: string) {
  const v = object(value, ["artifactKey", "hash", "plane"], path);
  if (
    typeof v.artifactKey !== "string" ||
    !/^\w[\w.-]*\/[\w.-]+$/.test(v.artifactKey)
  )
    fail(path, "immutable artifact reference required");
  if (typeof v.hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(v.hash))
    fail(path, "immutable hash required");
  list([v.plane], ["neon", "mesh", "studio"], `${path}.plane`);
}
export function parseCapabilityDeclaration(
  value: unknown,
  kind: EntityCapabilityKind,
  entityCode: string,
): CapabilityDeclaration {
  const path = `${entityCode}/core.capabilities.${kind}`;
  if (value === undefined) return Object.freeze({ enabled: false });
  const v = object(
    value,
    [
      "enabled",
      "reasonCode",
      "serviceKey",
      "ownerEntityCode",
      "load",
      "includeInAggregateData",
    ],
    path,
  );
  bool(v.enabled, `${path}.enabled`);
  if (v.enabled === false) {
    if (Object.keys(v).some((k) => !["enabled", "reasonCode"].includes(k)))
      fail(path, "disabled capability cannot carry executable bindings");
    if (
      v.reasonCode !== undefined &&
      (typeof v.reasonCode !== "string" || v.reasonCode.length > 128)
    )
      fail(path, "invalid reasonCode");
  } else {
    literal(v.serviceKey, `platform.${kind}.v1`, `${path}.serviceKey`);
    literal(v.ownerEntityCode, entityCode, `${path}.ownerEntityCode`);
    literal(v.load, "lazy", `${path}.load`);
    if (v.includeInAggregateData !== undefined)
      literal(
        v.includeInAggregateData,
        false,
        `${path}.includeInAggregateData`,
      );
    if (v.reasonCode !== undefined)
      fail(path, "enabled capability cannot carry disabled reason");
  }
  return Object.freeze({ ...v }) as CapabilityDeclaration;
}
export function parseCapabilityBinding(
  value: unknown,
  kind: "comments",
  entityCode: string,
): CommentBinding;
export function parseCapabilityBinding(
  value: unknown,
  kind: "attachments",
  entityCode: string,
): AttachmentBinding;
export function parseCapabilityBinding(
  value: unknown,
  kind: EntityCapabilityKind,
  entityCode: string,
): CommentBinding | AttachmentBinding;
export function parseCapabilityBinding(
  value: unknown,
  kind: EntityCapabilityKind,
  entityCode: string,
): CommentBinding | AttachmentBinding {
  const path = `${entityCode}/operation.${kind === "comments" ? "commentBinding" : "attachmentBinding"}`;
  const fields =
    kind === "comments"
      ? [
          "draftRetentionDays",
          "richTextSchema",
          "maxTextLength",
          "maxDepth",
          "allowedAudiences",
          "defaultAudience",
          "audiencePolicy",
          "features",
          "reactionCodes",
          "attachments",
        ]
      : [
          "maxFileBytes",
          "maxBatchCount",
          "allowedContentTypes",
          "scanRequired",
          "linkKinds",
          "categories",
          "folders",
          "versioning",
          "rename",
          "duplicateBehavior",
          "unlink",
          "download",
          "processing",
        ];
  const v = object(value, [...base, ...fields], path);
  literal(v.schemaVersion, 1, `${path}.schemaVersion`);
  literal(v.serviceKey, `platform.${kind}.v1`, `${path}.serviceKey`);
  literal(v.ownerEntityCode, entityCode, `${path}.ownerEntityCode`);
  literal(
    v.admissionResolverKey,
    "platform.records.admission.v1",
    `${path}.admissionResolverKey`,
  );
  list(v.layouts, ["drawer", "content"], `${path}.layouts`);
  if (v.retentionPolicy !== undefined)
    reference(v.retentionPolicy, `${path}.retentionPolicy`);
  if (!Array.isArray(v.actions) || !v.actions.length)
    fail(`${path}.actions`, "read action required");
  const found = new Set<string>();
  for (const [i, action] of v.actions.entries()) {
    const p = `${path}.actions[${i}]`,
      a = object(
        action,
        ["key", "permissionCode", "handlerKey", "concurrency", "idempotency"],
        p,
      );
    const k = key(a.key, `${p}.key`);
    if (!(actions[kind] as readonly string[]).includes(k) || found.has(k))
      fail(p, "unsupported/duplicate operation");
    found.add(k);
    key(a.permissionCode, `${p}.permissionCode`);
    literal(a.handlerKey, `platform.${kind}.${k}.v1`, `${p}.handlerKey`);
    list([a.concurrency], ["none", "revision"], `${p}.concurrency`);
    list([a.idempotency], ["none", "required"], `${p}.idempotency`);
    if (["update_own", "rename", "version", "folder"].includes(k))
      literal(a.concurrency, "revision", `${p}.concurrency`);
    if (["create", "finalize", "reply"].includes(k))
      literal(a.idempotency, "required", `${p}.idempotency`);
  }
  if (!found.has("read")) fail(path, "read action required");
  const needs = (enabled: unknown, names: string[]) => {
    if (enabled === true)
      for (const name of names)
        if (!found.has(name)) fail(path, `missing ${name} action`);
  };
  if (kind === "comments") {
    literal(
      v.richTextSchema,
      "athyper.rich-text/1.0",
      `${path}.richTextSchema`,
    );
    integer(v.maxTextLength, 1, 50000, `${path}.maxTextLength`);
    integer(v.maxDepth, 0, 5, `${path}.maxDepth`);
    const audience = list(
      v.allowedAudiences,
      ["public", "private", "internal"],
      `${path}.allowedAudiences`,
    );
    if (!audience.includes(String(v.defaultAudience)))
      fail(`${path}.defaultAudience`, "must be allowed");
    if (audience.includes("internal") && v.audiencePolicy === undefined)
      fail(path, "Internal requires immutable membership policy");
    if (v.audiencePolicy !== undefined)
      reference(v.audiencePolicy, `${path}.audiencePolicy`);
    if (v.draftRetentionDays !== undefined) integer(v.draftRetentionDays, 1, 365, `${path}.draftRetentionDays`);
    const f = object(
      v.features,
      [
        "replies",
        "edits",
        "reactions",
        "mentions",
        "drafts",
        "reporting",
        "history",
      ],
      `${path}.features`,
    );
    for (const name of [
      "replies",
      "edits",
      "reactions",
      "mentions",
      "drafts",
      "reporting",
      "history",
    ])
      bool(f[name], `${path}.features.${name}`);
    for (const [feature, action] of Object.entries({
      replies: "reply",
      edits: "update_own",
      reactions: "react",
      mentions: "mention",
      drafts: "draft",
      reporting: "flag",
      history: "history",
    })) {
      needs(f[feature], [action]);
      if (f[feature] === false && found.has(action))
        fail(path, `disabled ${feature} has executable ${action} action`);
    }
    list(
      v.reactionCodes,
      [
        "like",
        "love",
        "laugh",
        "wow",
        "sad",
        "angry",
        "thumbs_up",
        "heart",
        "celebrate",
      ],
      `${path}.reactionCodes`,
      f.reactions ? 1 : 0,
    );
    const a = object(
      v.attachments,
      ["allowed", "maxCount", "pinVersion", "bindingRef"],
      `${path}.attachments`,
    );
    bool(a.allowed, `${path}.attachments.allowed`);
    integer(
      a.maxCount,
      a.allowed ? 1 : 0,
      a.allowed ? 10 : 0,
      `${path}.attachments.maxCount`,
    );
    literal(a.pinVersion, true, `${path}.attachments.pinVersion`);
    if (!a.allowed && a.bindingRef !== undefined)
      fail(path, "disabled attachments cannot bind a policy");
    if (a.allowed)
      literal(
        a.bindingRef,
        `${entityCode}/operation#attachmentBinding`,
        `${path}.attachments.bindingRef`,
      );
  } else {
    integer(v.maxFileBytes, 1, 26214400, `${path}.maxFileBytes`);
    integer(v.maxBatchCount, 1, 10, `${path}.maxBatchCount`);
    list(v.allowedContentTypes, mime, `${path}.allowedContentTypes`);
    literal(v.scanRequired, true, `${path}.scanRequired`);
    list(
      v.linkKinds,
      ["context", "evidence", "comment", "related"],
      `${path}.linkKinds`,
    );
    list(v.categories, ["general", "evidence"], `${path}.categories`, 0);
    for (const name of ["folders", "versioning", "rename"])
      bool(v[name], `${path}.${name}`);
    needs(v.folders, ["folder"]);
    needs(Array.isArray(v.categories) && v.categories.length > 0, ["category"]);
    needs(v.versioning, ["version"]);
    needs(v.rename, ["rename"]);
    list(
      [v.duplicateBehavior],
      ["reject", "new_version"],
      `${path}.duplicateBehavior`,
    );
    if (v.duplicateBehavior === "new_version" && !v.versioning)
      fail(path, "new_version requires versioning");
    literal(v.unlink, "association_only", `${path}.unlink`);
    literal(v.download, "short_lived_authorized_url", `${path}.download`);
    const p = object(
      v.processing,
      ["preview", "extraction", "search", "renditions"],
      `${path}.processing`,
    );
    for (const name of ["preview", "extraction", "search"])
      bool(p[name], `${path}.processing.${name}`);
    if (p.search && !p.extraction) fail(path, "search requires extraction");
    needs(p.preview, ["preview"]);
    needs(p.extraction, ["extract"]);
    needs(p.search, ["search"]);
    list(
      p.renditions,
      ["thumbnail", "pdf", "image"],
      `${path}.processing.renditions`,
      p.preview ? 1 : 0,
    );
  }
  return Object.freeze(structuredClone(v)) as unknown as
    CommentBinding | AttachmentBinding;
}

/** Pure graph validation used both at compilation and persisted-payload admission. */
export function validateEntityCapabilities(
  artifacts: readonly CompiledEntityArtifactV2[],
  registry?: CompiledEntityRegistry,
): void {
  const byKey = new Map(artifacts.map((a) => [a.artifactKey, a]));
  for (const core of artifacts.filter(
    (a) =>
      a.artifactType === "core" && a.artifactKey === `${a.entityCode}/core`,
  )) {
    const capabilities = core.content.capabilities as
      Record<string, unknown> | undefined;
    const operation = byKey.get(`${core.entityCode}/operation`);
    for (const kind of kinds) {
      const declaration = parseCapabilityDeclaration(
        capabilities?.[kind],
        kind,
        core.entityCode,
      );
      const property =
        kind === "comments" ? "commentBinding" : "attachmentBinding";
      const raw = operation?.content[property];
      const sections = artifacts.filter(
        (a) =>
          a.entityCode === core.entityCode &&
          a.artifactType === "presentation_section" &&
          a.content.rendererKey === `platform.${kind}.v1`,
      );
      if (!declaration.enabled) {
        if (raw !== undefined || sections.length)
          fail(
            core.artifactKey,
            `disabled ${kind} has executable binding/section`,
          );
        continue;
      }
      if (!operation) fail(core.artifactKey, "missing Operation artifact");
      const binding = parseCapabilityBinding(raw, kind, core.entityCode);
      if (registry) {
        if (
          !registry.resolvers.has(binding.admissionResolverKey) ||
          !registry.renderers.has(binding.serviceKey) ||
          !registry.handlers.has(binding.serviceKey)
        )
          fail(operation.artifactKey, "unregistered capability owner/service");
        for (const action of binding.actions)
          if (
            !registry.handlers.has(action.handlerKey) ||
            !registry.permissions?.has(action.permissionCode) ||
            !action.permissionCode.startsWith(`${core.plane}.`)
          )
            fail(
              operation.artifactKey,
              `unregistered handler/permission for ${action.key}`,
            );
      }
      for (const ref of [
        binding.retentionPolicy,
        kind === "comments"
          ? (binding as CommentBinding).audiencePolicy
          : undefined,
      ])
        if (ref) {
          const dep = byKey.get(ref.artifactKey);
          if (
            ref.plane !== core.plane ||
            !dep ||
            dep.plane !== core.plane ||
            dep.artifactHash !== ref.hash ||
            !operation.dependencies.includes(ref.artifactKey)
          )
            fail(
              operation.artifactKey,
              "policy must be an immutable same-plane release dependency",
            );
        }
      if (
        kind === "comments" &&
        (binding as CommentBinding).attachments.allowed
      ) {
        if (
          !parseCapabilityDeclaration(
            capabilities?.attachments,
            "attachments",
            core.entityCode,
          ).enabled
        )
          fail(
            operation.artifactKey,
            "comment files require attachment capability",
          );
      }
      for (const section of sections) {
        const d = section.content.dataBinding as
          Record<string, unknown> | undefined;
        if (!section.dependencies.includes(operation.artifactKey))
          fail(
            section.artifactKey,
            "capability section must depend on Operation",
          );
        if (
          d?.serviceKey !== binding.serviceKey ||
          d?.ownerEntityCode !== core.entityCode
        )
          fail(section.artifactKey, "capability owner/service mismatch");
        const declared = section.content.availableOperations;
        if (Array.isArray(declared))
          for (const action of declared) {
            const a = action as Record<string, unknown>,
              target = binding.actions.find((x) => x.key === a.key);
            if (
              !target ||
              a.permissionCode !== target.permissionCode ||
              (a.execution as Record<string, unknown>)?.handlerKey !==
                target.handlerKey
            )
              fail(
                section.artifactKey,
                "section action contradicts capability binding",
              );
          }
      }
    }
  }
}

/** Browser projection is an explicit allowlist; no handler, storage or policy references. */
export function projectEntityCapability(
  binding: CommentBinding | AttachmentBinding,
  allowed: ReadonlySet<string>,
) {
  return Object.freeze({
    schemaVersion: 1 as const,
    layouts: binding.layouts,
    actions: binding.actions
      .filter((a) => allowed.has(a.permissionCode))
      .map((a) => ({
        key: a.key,
        concurrency: a.concurrency,
        idempotency: a.idempotency,
      })),
    ...("maxFileBytes" in binding
      ? {
          maxFileBytes: binding.maxFileBytes,
          maxBatchCount: binding.maxBatchCount,
          allowedContentTypes: binding.allowedContentTypes,
          categories: binding.categories,
        }
      : {
          maxTextLength: binding.maxTextLength,
          maxDepth: binding.maxDepth,
          allowedAudiences: binding.allowedAudiences,
          defaultAudience: binding.defaultAudience,
          maxAttachments: binding.attachments.maxCount,
        }),
  });
}
