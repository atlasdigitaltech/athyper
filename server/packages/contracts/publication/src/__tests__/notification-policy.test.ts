import { describe, expect, it } from "vitest";
import {
  compileEntityNotificationConfiguration as compile,
  defaultNotificationConfiguration as defaults,
  parseEntityNotificationConfiguration as parse,
  previewNotificationTemplate as preview,
  sharedNotificationTemplates,
  parseNotificationRecordCoordinate,
} from "../notification-policy.js";
const template = {
  key: "bp_mention",
  channel: "email",
  locale: "en",
  version: 1,
  subject: "Hello {{name}}",
  bodyText: "{{excerpt}}",
  variables: { name: "string", excerpt: "string" },
};
describe("notification configuration v1", () => {
  it("inherits shared defaults, overrides by event, and makes disabled terminal", () => {
    const inherited = compile(defaults("comments"), "comments");
    expect(inherited.rules[0]?.channels).toEqual(["in_app", "email"]);
    expect(inherited.templates).toEqual([]);
    const rule = {
      ...inherited.rules[0]!,
      channels: ["email"],
      templates: [
        { key: "bp_mention", channel: "email", locale: "en", version: 1 },
      ],
    };
    expect(
      compile(
        {
          ...defaults("comments"),
          mode: "override",
          templates: [template],
          rules: [rule],
        },
        "comments",
      ).rules,
    ).toEqual([rule]);
    expect(
      compile({ ...defaults("comments"), mode: "disabled" }, "comments").rules,
    ).toEqual([]);
    expect(compile(defaults("attachments"), "attachments").rules).toEqual([]);
  });
  it.each([
    { schemaVersion: 2 },
    { defaultPolicyRef: "missing.v1" },
    { mode: "enabled" },
    { rules: [{ ...compile(defaults("comments"), "comments").rules[0] }] },
    { templates: [sharedNotificationTemplates()[0]] },
    { unknown: true },
  ])("rejects incompatible or ambiguous configuration %j", (patch) =>
    expect(() =>
      parse({ ...defaults("comments"), ...patch }, "comments"),
    ).toThrow(),
  );
  it("rejects missing/version-incompatible and cross-channel template references", () => {
    const base = compile(defaults("comments"), "comments").rules[0]!;
    for (const ref of [
      { key: "missing", channel: "email", locale: "en", version: 1 },
      { key: "comment_mention", channel: "email", locale: "en", version: 2 },
      { key: "comment_mention", channel: "sms", locale: "en", version: 1 },
    ])
      expect(() =>
        parse(
          {
            ...defaults("comments"),
            mode: "override",
            rules: [{ ...base, templates: [ref] }],
          },
          "comments",
        ),
      ).toThrow();
  });
  it("renders synthetic text with HTML escaping and rejects missing/wrong variables", () => {
    expect(
      preview(template, { name: "Sam", excerpt: "<script>& hi" }),
    ).toMatchObject({
      subject: "Hello Sam",
      bodyHtml: "<p>&lt;script&gt;&amp; hi</p>",
    });
    for (const vars of [
      { name: "Sam" },
      { name: 1, excerpt: "hi" },
      { name: "Sam\nBcc:", excerpt: "hi" },
      { name: "Sam", excerpt: "hi", extra: "bad" },
    ])
      expect(() => preview(template, vars)).toThrow();
    expect(() =>
      preview({ ...template, bodyText: "{{undeclared}}" }, {}),
    ).toThrow(/Undeclared/);
  });
  it("returns isolated shared defaults and preserves explicit parent coordinates", () => {
    const t = sharedNotificationTemplates() as any;
    t[0].bodyText = "changed";
    expect(sharedNotificationTemplates()[0]?.bodyText).toBe("{{excerpt}}");
    expect(
      parseNotificationRecordCoordinate({
        resourceType: "document.comment",
        resourceId: "comment-1",
        parentEntityCode: "business_partner",
        parentRecordId: "bp-1",
      }).parentEntityCode,
    ).toBe("business_partner");
    expect(() =>
      parseNotificationRecordCoordinate({
        resourceType: "document.comment",
        resourceId: "comment-1",
      }),
    ).toThrow();
  });
});
