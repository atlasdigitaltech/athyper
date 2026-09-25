import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  NotificationConfigurationError,
  defaultNotificationConfiguration,
  parseEntityNotificationConfiguration,
  parseNotificationTemplate,
  parseNotificationTemplateReference,
  notificationTemplateCoordinate,
  sharedNotificationTemplates,
  compileEntityNotificationConfiguration,
  previewNotificationTemplate,
  type NotificationCapability,
  type EntityNotificationConfiguration,
} from "@athyper/server-contract-publication";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import type { MetaEntityAuthoringService } from "./authoring-service.js";

/** Draft edits use the same graph repository/revision guard as the full editor.
 * Publication is deliberately NOT duplicated here: use validate/test/submit/approve/publish.
 */
export function registerNotificationAuthoringRoutes(
  app: Application,
  options: {
    authenticate: RequestHandler;
    authorize(
      response: Response,
      permission: string,
      changeSetId?: string,
    ): Promise<VerifiedRequestContext | undefined>;
    service: MetaEntityAuthoringService;
  },
) {
  const base =
    "/api/meta-entity-authoring/change-sets/:id/notifications/:capability";
  const wrap =
    (work: (q: any, s: Response) => Promise<void>): RequestHandler =>
    (q, s, next) => {
      void work(q, s).catch((error) => {
        if (
          error instanceof NotificationConfigurationError ||
          error instanceof TypeError
        ) {
          s.status(422).json({
            code: "NOTIFICATION_CONFIGURATION_INVALID",
            detail: error.message,
          });
          return;
        }
        if (error instanceof AuthoringConflictError) {
          s.status(409).json({ code: error.code, detail: error.message });
          return;
        }
        if (error instanceof AuthoringPolicyError) {
          s.status(error.code === "FORBIDDEN" ? 403 : 409).json({
            code: error.code,
            detail: error.message,
          });
          return;
        }
        next(error);
      });
    };
  const loadDraft = async (
    q: any,
    s: Response,
    permission = "metadata.entity.author",
  ) => {
    const id = String(q.params.id);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new TypeError("Invalid change-set UUID");
    const context = await options.authorize(s, permission, id);
    if (!context) return;
    await options.service.assertTenant(id, context.tenantId);
    const state = await options.service.readGraph(id);
    s.setHeader("Cache-Control", "private, no-store");
    return { id, context, state };
  };
  const load = async (
    q: any,
    s: Response,
    permission = "metadata.entity.author",
  ) => {
    const loaded = await loadDraft(q, s, permission);
    if (!loaded) return;
    const { id, context, state } = loaded;
    const kind = q.params.capability as NotificationCapability;
    if (kind !== "comments" && kind !== "attachments")
      throw new TypeError("Unknown notification capability");
    const member = state.graph.capabilities?.find(
      (m) => m.capabilityKey === kind,
    );
    if (!member?.declaration.enabled || !member.binding) {
      s.status(404).json({ code: "ENTITY_CAPABILITY_UNAVAILABLE" });
      return;
    }
    const configuration = parseEntityNotificationConfiguration(
      member.binding.notifications ?? defaultNotificationConfiguration(kind),
      kind,
    );
    s.setHeader("Cache-Control", "private, no-store");
    return { id, context, kind, state, member, configuration };
  };
  const save = async (
    loaded: NonNullable<Awaited<ReturnType<typeof load>>>,
    expectedRevision: unknown,
    config: unknown,
  ) => {
    if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0)
      throw new TypeError("expectedRevision is required");
    if (expectedRevision !== loaded.state.changeSet.revision)
      throw new AuthoringConflictError(
        "The draft changed; reload before saving",
      );
    const notifications = parseEntityNotificationConfiguration(
      config,
      loaded.kind,
    );
    const graph = {
      ...loaded.state.graph,
      capabilities: loaded.state.graph.capabilities!.map((m) =>
        m.capabilityKey === loaded.kind
          ? { ...m, binding: { ...m.binding!, notifications } }
          : m,
      ),
    };
    return options.service.replaceGraph({
      changeSetId: loaded.id,
      expectedRevision: Number(expectedRevision),
      graph,
      actorId: loaded.context.principalId,
      context: loaded.context,
    });
  };
  app.get(
    "/api/meta-entity-authoring/change-sets/:id/notifications",
    options.authenticate,
    wrap(async (q, s) => {
      const loaded = await loadDraft(q, s);
      if (!loaded) return;
      s.json({
        revision: loaded.state.changeSet.revision,
        policies: (loaded.state.graph.capabilities ?? [])
          .filter((m) => m.declaration.enabled && m.binding)
          .map((m) => ({
            capability: m.capabilityKey,
            configuration: parseEntityNotificationConfiguration(
              m.binding!.notifications ??
                defaultNotificationConfiguration(m.capabilityKey),
              m.capabilityKey,
            ),
          })),
      });
    }),
  );
  app.get(
    base,
    options.authenticate,
    wrap(async (q, s) => {
      const l = await load(q, s);
      if (l)
        s.json({
          revision: l.state.changeSet.revision,
          configuration: l.configuration,
          projection: compileEntityNotificationConfiguration(
            l.configuration,
            l.kind,
          ),
        });
    }),
  );
  app.get(
    `${base}/templates`,
    options.authenticate,
    wrap(async (q, s) => {
      const l = await load(q, s);
      if (l)
        s.json({
          revision: l.state.changeSet.revision,
          shared: sharedNotificationTemplates(),
          overrides: l.configuration.templates,
        });
    }),
  );
  app.get(
    `${base}/templates/:key`,
    options.authenticate,
    wrap(async (q, s) => {
      const l = await load(q, s);
      if (!l) return;
      const items = [
        ...sharedNotificationTemplates(),
        ...l.configuration.templates,
      ].filter(
        (t) =>
          t.key === q.params.key &&
          (!q.query.channel || t.channel === q.query.channel) &&
          (!q.query.locale || t.locale === q.query.locale) &&
          (!q.query.version || t.version === Number(q.query.version)),
      );
      if (!items.length) {
        s.status(404).json({ code: "NOTIFICATION_TEMPLATE_NOT_FOUND" });
        return;
      }
      s.json({ revision: l.state.changeSet.revision, templates: items });
    }),
  );
  app.put(
    `${base}/templates/:key`,
    options.authenticate,
    wrap(async (q, s) => {
      const l = await load(q, s);
      if (!l) return;
      bodyKeys(q.body, ["expectedRevision", "template"]);
      const template = parseNotificationTemplate(q.body.template);
      if (template.key !== q.params.key)
        throw new TypeError("Template key does not match the route");
      const coordinate = notificationTemplateCoordinate(template);
      const config = {
        ...l.configuration,
        templates: [
          ...l.configuration.templates.filter(
            (t) => notificationTemplateCoordinate(t) !== coordinate,
          ),
          template,
        ],
      };
      const result = await save(l, q.body.expectedRevision, config);
      s.json({ changeSet: result, template });
    }),
  );
  app.put(
    `${base}/policy`,
    options.authenticate,
    wrap(async (q, s) => {
      const l = await load(q, s);
      if (!l) return;
      bodyKeys(q.body, ["expectedRevision", "policy"]);
      bodyKeys(q.body.policy, [
        "schemaVersion",
        "mode",
        "defaultPolicyRef",
        "rules",
      ]);
      const config = {
        ...q.body.policy,
        templates: l.configuration.templates,
        ...(l.configuration.targetEntityCode
          ? { targetEntityCode: l.configuration.targetEntityCode }
          : {}),
      } as EntityNotificationConfiguration;
      const result = await save(l, q.body.expectedRevision, config);
      s.json({ changeSet: result, configuration: config });
    }),
  );
  app.post(
    `${base}/validate`,
    options.authenticate,
    wrap(async (q, s) => {
      const l = await load(q, s, "metadata.entity.validate");
      if (!l) return;
      bodyKeys(q.body ?? {}, ["configuration"]);
      const configuration = parseEntityNotificationConfiguration(
        q.body?.configuration ?? l.configuration,
        l.kind,
      );
      s.json({
        valid: true,
        projection: compileEntityNotificationConfiguration(
          configuration,
          l.kind,
        ),
      });
    }),
  );
  app.post(
    `${base}/preview`,
    options.authenticate,
    wrap(async (q, s) => {
      const l = await load(q, s);
      if (!l) return;
      bodyKeys(q.body, ["reference", "variables"]);
      const ref = parseNotificationTemplateReference(q.body.reference);
      const template = [
        ...sharedNotificationTemplates(),
        ...l.configuration.templates,
      ].find(
        (t) =>
          notificationTemplateCoordinate(t) ===
          notificationTemplateCoordinate(ref),
      );
      if (!template) {
        s.status(404).json({ code: "NOTIFICATION_TEMPLATE_NOT_FOUND" });
        return;
      }
      s.json({
        preview: previewNotificationTemplate(template, q.body.variables),
        sent: false,
      });
    }),
  );
}
function bodyKeys(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new TypeError(`Expected object with properties: ${keys.join(", ")}`);
}
