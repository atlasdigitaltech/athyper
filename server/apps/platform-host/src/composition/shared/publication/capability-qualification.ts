import { sql, type Kysely } from "kysely";
import {
  capabilityArtifactMembers,
  capabilityBindingKey,
  ACTIVITY_PERMISSION_CATALOG,
  isActivityPermissionCode,
  parseActivityBinding,
  type ACTIVITY_ACTIONS,
} from "@athyper/server-contract-publication";
import type { ReferenceFirstPublicationPorts } from "@athyper/server-plane-studio-meta-entity-authoring";

type Target =
  | Parameters<ReferenceFirstPublicationPorts["qualify"]>[0]
  | Parameters<
      import("@athyper/server-plane-studio-meta-entity-authoring").HumanReviewedPublicationPorts["qualify"]
    >[0][number];
export type CapabilityQualificationProviders = {
  parentRead: boolean;
  resourceHeader: boolean;
  section(serviceKey: string): unknown;
  recordHistory?: { prepare: unknown; qualify(target: Target): Promise<void> };
  activity?: Partial<Record<keyof typeof ACTIVITY_ACTIONS, unknown>>;
  comments?: {
    create: unknown;
    edit: unknown;
    remove: unknown;
    putReaction?: unknown;
    deleteReaction?: unknown;
    putDraft?: unknown;
    getDraft?: unknown;
    deleteDraft?: unknown;
    flag?: unknown;
    participants?: unknown;
    history?: unknown;
  };
  attachments?: {
    stage: unknown;
    finalize: unknown;
    createAuthorizedDownload: unknown;
    archive?: unknown;
    status?: unknown;
    rename?: unknown;
    setCategory?: unknown;
    manageFolder?: unknown;
    unlink?: unknown;
  };
  discovery?: { preview: unknown; extract: unknown; search: unknown };
  processing?: {
    qualifyPreview?: () => Promise<void>;
    qualifyExtraction?: () => Promise<void>;
  };
  storage?: { validateAccess(): Promise<void> };
  scanner?: { health(): Promise<{ status: string }> };
};
/** Actual host services plus live catalog/storage probes. This is prerequisite
 * qualification, not a replacement for tenant-isolation or live acceptance tests.
 * No entity name is used to select providers or infer authority. */
export function createCapabilityQualification(options: {
  databases: Readonly<
    Partial<Record<Target["targetPlane"], Kysely<Record<string, never>>>>
  >;
  providers(): CapabilityQualificationProviders;
}): (target: Target) => Promise<void> {
  return async (target) => {
    const members = target.graph.capabilities ?? [];
    const mapped = capabilityArtifactMembers(
      target.graph.entity.entityCode,
      members,
    );
    const enabled = members.filter((member) => member.declaration.enabled);
    if (!enabled.length) return;
    const db = options.databases[target.targetPlane],
      providers = options.providers();
    if (!db || !providers.parentRead || !providers.resourceHeader)
      throw Error("PUBLICATION_CAPABILITY_PARENT_UNAVAILABLE");
    const permissions = new Set<string>(),
      tables = new Map<
        string,
        { insert: boolean; update: boolean; delete?: boolean }
      >();
    for (const member of enabled) {
      const binding =
        mapped.operationBindings[capabilityBindingKey(member.capabilityKey)];
      const section = binding
        ? providers.section(binding.serviceKey)
        : undefined;
      if (
        !binding ||
        !section ||
        typeof section !== "object" ||
        typeof Reflect.get(section, "read") !== "function" ||
        binding.admissionResolverKey !== "platform.records.admission.v1"
      )
        throw Error("PUBLICATION_CAPABILITY_SECTION_UNAVAILABLE");
      if (
        binding.notifications ||
        binding.retentionPolicy ||
        ("audiencePolicy" in binding && binding.audiencePolicy)
      )
        throw Error("PUBLICATION_CAPABILITY_POLICY_PROVIDER_REQUIRED");
      const methods: Record<string, unknown> =
        member.capabilityKey === "activity"
          ? { ...providers.activity }
          : member.capabilityKey === "comments"
            ? {
                read: providers.section(binding.serviceKey),
                create: providers.comments?.create,
                update_own: providers.comments?.edit,
                archive_own: providers.comments?.remove,
                reply: providers.comments?.create,
                react: providers.comments?.putReaction,
                draft: providers.comments?.putDraft,
                flag: providers.comments?.flag,
                mention: providers.comments?.participants,
                history: providers.comments?.history,
              }
            : {
                read: providers.section(binding.serviceKey),
                create: providers.attachments?.stage,
                finalize: providers.attachments?.finalize,
                download: providers.attachments?.createAuthorizedDownload,
                archive: providers.attachments?.archive,
                status: providers.attachments?.status,
                version: providers.attachments?.stage,
                rename: providers.attachments?.rename,
                category: providers.attachments?.setCategory,
                folder: providers.attachments?.manageFolder,
                unlink: providers.attachments?.unlink,
                preview: providers.discovery?.preview,
                extract: providers.discovery?.extract,
                search: providers.discovery?.search,
              };
      for (const action of binding.actions) {
        if (
          action.handlerKey !==
            `platform.${member.capabilityKey}.${action.key}.v1` ||
          !Object.hasOwn(methods, action.key) ||
          (action.key !== "read" && typeof methods[action.key] !== "function")
        )
          throw Error("PUBLICATION_CAPABILITY_HANDLER_UNAVAILABLE");
        permissions.add(action.permissionCode);
      }
      if (member.capabilityKey === "comments") {
        if (
          "attachments" in binding &&
          binding.attachments.allowed &&
          !enabled.some((m) => m.capabilityKey === "attachments")
        )
          throw Error("PUBLICATION_CAPABILITY_ATTACHMENT_BINDING_REQUIRED");
        // comment_type/comment_intent are lookup-domain keys, not SQL tables.
        tables.set("comment", {
          insert: binding.actions.some((action) => action.key === "create"),
          update: binding.actions.some((action) =>
            ["update_own", "archive_own"].includes(action.key),
          ),
        });
        // The security-definer capture trigger is the sole revision writer.
        // Requiring direct INSERT would defeat the append-only audit boundary.
        tables.set("comment_revision", { insert: false, update: false });
        if ("features" in binding) {
          if (binding.features.reactions) {
            if (typeof providers.comments?.deleteReaction !== "function")
              throw Error("PUBLICATION_CAPABILITY_HANDLER_UNAVAILABLE");
            tables.set("comment_reaction", {
              insert: true,
              update: false,
              delete: true,
            });
          }
          if (binding.features.mentions)
            tables.set("comment_mention", {
              insert: true,
              update: false,
              delete: true,
            });
          if (binding.features.drafts) {
            // Draft reads use the already-qualified section provider.
            if (typeof providers.comments?.deleteDraft !== "function")
              throw Error("PUBLICATION_CAPABILITY_HANDLER_UNAVAILABLE");
            tables.set("comment_draft", {
              insert: true,
              update: true,
              delete: true,
            });
          }
          if (binding.features.reporting)
            tables.set("event.comment_flag", { insert: true, update: true });
        }
      } else if (member.capabilityKey === "activity") {
        const activity = parseActivityBinding(
          binding,
          target.graph.entity.entityCode,
        );
        if (activity.recording) {
          if (typeof providers.recordHistory?.prepare !== "function")
            throw Error("PUBLICATION_ACTIVITY_WRITE_PROVIDER_REQUIRED");
          await providers.recordHistory.qualify(target);
          tables.set("snapshot.record_version", {
            insert: true,
            update: false,
          });
          tables.set("event.command_execution", { insert: true, update: true });
        }

        if (
          binding.actions.some((action) =>
            ["audit_query", "timeline_query"].includes(action.key),
          )
        )
          tables.set("audit.audit_log", { insert: false, update: false });
        if (
          binding.actions.some((action) => action.key === "snapshots_capture")
        )
          tables.set("event.command_execution", { insert: true, update: true });
        if (
          activity.snapshots.automaticCapture !== "none" ||
          binding.actions.some((action) => action.key.startsWith("snapshots_"))
        ) {
          tables.set("snapshot.entity_snapshot_identity", {
            insert: false,
            update: false,
          });
          tables.set("snapshot.entity_snapshot", {
            insert: false,
            update: false,
          });
        }
      } else {
        for (const name of [
          "attachment",
          "attachment_series",
          "attachment_link",
        ])
          tables.set(name, {
            insert: binding.actions.some((action) =>
              ["create", "finalize"].includes(action.key),
            ),
            update: binding.actions.some(
              (action) =>
                ![
                  "read",
                  "download",
                  "status",
                  "preview",
                  "extract",
                  "search",
                ].includes(action.key),
            ),
            delete:
              name === "attachment_link" &&
              binding.actions.some((action) => action.key === "unlink"),
          });
        if ("processing" in binding) {
          if (binding.folders) {
            tables.set("attachment_folder", {
              insert: true,
              update: true,
              delete: true,
            });
            tables.set("attachment_workspace", { insert: true, update: true });
          }
          if (binding.processing.preview) {
            if (!providers.processing?.qualifyPreview)
              throw Error("PUBLICATION_CAPABILITY_PREVIEW_UNAVAILABLE");
            await providers.processing.qualifyPreview();
            tables.set("attachment_derivative", {
              insert: false,
              update: false,
            });
          }
          if (binding.processing.extraction) {
            if (!providers.processing?.qualifyExtraction)
              throw Error("PUBLICATION_CAPABILITY_EXTRACTION_UNAVAILABLE");
            await providers.processing.qualifyExtraction();
          }
        }
        if (!providers.storage || !providers.scanner)
          throw Error(
            "PUBLICATION_CAPABILITY_ATTACHMENT_INFRASTRUCTURE_REQUIRED",
          );
        // Existing adapter checks its bucket and writes/deletes a bounded probe.
        // Scanner health is a real ClamAV probe, not presence of an object.
        await providers.storage.validateAccess();
        if ((await providers.scanner.health()).status !== "healthy")
          throw Error("PUBLICATION_CAPABILITY_SCANNER_UNAVAILABLE");
      }
    }
    await db
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (tx) => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        await sql`SET LOCAL statement_timeout='3000ms'`.execute(tx);
        for (const member of enabled) {
          if (member.capabilityKey !== "attachments") continue;
          const binding = mapped.operationBindings.attachmentBinding;
          if (
            binding &&
            "processing" in binding &&
            binding.processing.extraction
          )
            await sql`SELECT extracted_text,text_extraction_status,text_extraction_error,text_extracted_at,extracted_text_chars FROM document.attachment WHERE false`.execute(
              tx,
            );
          if (binding && "processing" in binding && binding.processing.preview)
            await sql`SELECT scan_status,scanned_at,source_sha256 FROM document.attachment_derivative WHERE false`.execute(
              tx,
            );
        }
        if (enabled.some((member) => member.capabilityKey === "comments")) {
          const row = (
            await sql<{ active: boolean }>`SELECT
          control.lookup_value_is_active('document.comment_type','entity',NULL)
          AND control.lookup_value_is_active('document.comment_intent','general',NULL) AS active`.execute(
              tx,
            )
          ).rows[0];
          if (row?.active !== true)
            throw Error("PUBLICATION_CAPABILITY_LOOKUP_UNAVAILABLE");
          const triggers = (
            await sql<{
              name: string;
            }>`SELECT t.tgname AS name FROM pg_trigger t
          JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE NOT t.tgisinternal AND t.tgenabled IN ('O','A') AND n.nspname='document'
          AND ((t.tgrelid='document.comment'::regclass AND t.tgname='comment_revision_capture'
            AND p.proname='trg_capture_comment_revision' AND p.prosecdef AND t.tgtype=21)
          OR (t.tgrelid='document.comment'::regclass AND t.tgname='comment_revision_number'
            AND p.proname='trg_comment_revision_number' AND t.tgtype=23)
          OR (t.tgrelid='document.comment_revision'::regclass AND t.tgname='comment_revision_immutable'
            AND p.proname='trg_comment_revision_immutable' AND t.tgtype=27))`.execute(
              tx,
            )
          ).rows;
          const names = new Set(triggers.map((trigger) => trigger.name));
          if (
            names.size !== 3 ||
            ![
              "comment_revision_capture",
              "comment_revision_number",
              "comment_revision_immutable",
            ].every((name) => names.has(name))
          )
            throw Error(
              "PUBLICATION_CAPABILITY_REVISION_INTEGRITY_UNAVAILABLE",
            );
        }
        if (enabled.some((member) => member.capabilityKey === "activity")) {
          const binding = mapped.operationBindings.activityBinding!;
          const activity = parseActivityBinding(
            binding,
            target.graph.entity.entityCode,
          );
          if (activity.recording) {
            const triggers = (
              await sql`SELECT t.oid FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='snapshot.record_version'::regclass AND t.tgname='record_version_immutable' AND t.tgenabled='O' AND t.tgtype=27 AND p.proname='trg_record_version_immutable'`.execute(
                tx,
              )
            ).rows;
            if (triggers.length !== 1)
              throw Error("PUBLICATION_ACTIVITY_HISTORY_INTEGRITY_REQUIRED");
          }
          if (
            activity.snapshots.automaticCapture !== "none" ||
            binding.actions.some((action) => action.key === "snapshots_capture")
          ) {
            const rows = (
              await sql`SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='snapshot' AND p.proname='fn_capture_entity' AND p.prosecdef
              AND oidvectortypes(p.proargtypes)='text, uuid, text, integer, text, bigint, text, snapshot.capture_kind_d, jsonb, uuid, uuid, timestamp with time zone, timestamp with time zone, snapshot.retention_class_d, text'
              AND has_function_privilege(p.oid,'EXECUTE')`.execute(tx)
            ).rows;
            if (rows.length !== 1)
              throw Error("PUBLICATION_CAPABILITY_CAPTURE_UNAVAILABLE");
          }
        }
        for (const permission of permissions) {
          const activity = isActivityPermissionCode(permission)
            ? ACTIVITY_PERMISSION_CATALOG[permission]
            : undefined;
          const rows = (
            await sql`SELECT p.id FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id
          WHERE p.canonical_code=${permission} AND p.status='published' AND s.status='active' AND s.scope_kind='tenant'
          ${
            activity
              ? sql`AND p.permission_kind='capability' AND p.risk_tier::text=${activity.riskTier}
            AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable AND NOT p.is_delegable AND NOT p.is_overridable
            AND s.propagation_mode='exact'
            AND NOT EXISTS(SELECT 1 FROM authz.permission_scope_kind extra WHERE extra.permission_id=p.id AND extra.status='active'
              AND (extra.scope_kind<>'tenant' OR extra.propagation_mode<>'exact'))`
              : sql``
          }`.execute(tx)
          ).rows;
          if (rows.length !== 1)
            throw Error("PUBLICATION_CAPABILITY_PERMISSION_UNAVAILABLE");
        }
        for (const [table, privileges] of tables) {
          const [schema, name] = table.includes(".")
            ? table.split(".")
            : ["document", table];
          const rows = (
            await sql`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=${schema} AND c.relname=${name} AND c.relkind IN ('r','p') AND c.relrowsecurity
            AND has_table_privilege(c.oid,'SELECT')
            ${privileges.insert ? sql`AND has_table_privilege(c.oid,'INSERT')` : sql``}
            ${privileges.update ? sql`AND has_table_privilege(c.oid,'UPDATE')` : sql``}
            ${privileges.delete ? sql`AND has_table_privilege(c.oid,'DELETE')` : sql``}
            AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)`.execute(
              tx,
            )
          ).rows;
          if (rows.length !== 1)
            throw Error("PUBLICATION_CAPABILITY_PERSISTENCE_UNAVAILABLE");
        }
      });
  };
}
