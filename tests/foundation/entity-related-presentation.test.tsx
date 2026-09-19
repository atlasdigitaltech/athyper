import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  parseEntityRecordPresentation,
  validateRecordPresentationReferences,
  readableRecordPresentation,
} from "../../packages/contracts/platform/entity-runtime/src/record-presentation";
import {
  RelatedRecord,
  RelatedSectionError,
  safeChannelHref,
} from "../../packages/platform/entity/runtime/form-detail/src/related-record";
const config = JSON.parse(
  readFileSync(
    new URL(
      "../../server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const presentation = parseEntityRecordPresentation(config.recordPresentation);
const contact = presentation.related![0]!,
  address = presentation.related![1]!;
const values = {
  displayName: "Nur Aisyah",
  primary: true,
  departmentName: "Operations",
  channels: [
    { id: "email", type: "email", value: "nur@example.test", verified: true },
    { id: "phone", type: "phone", value: "+60123456789", verified: false },
  ],
};
test("published labels, order, grouping and badges drive both detail and compact renderers", () => {
  const profile = structuredClone(contact) as any;
  profile.groups[1].fields[3].values.true.label = "Confirmed email";
  profile.groups[1].label = "Reach this person";
  profile.groups.reverse();
  const parsed = parseEntityRecordPresentation({
    ...presentation,
    related: [profile],
  }).related![0]!;
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(
      <RelatedRecord profile={parsed} values={values} compact={compact} />,
    );
    if (!compact) assert.match(html, /Reach this person/);
    assert.match(html, /Confirmed email/);
    assert.match(html, /Not verified/);
    assert.match(html, /mailto:nur@example.test/);
    assert.match(html, /tel:\+60123456789/);
    if (!compact)
      assert.ok(
        html.indexOf("Reach this person") < html.indexOf("Contact details"),
      );
  }
});
test("publication rejects unknown fields, mismatched providers, renderer types, scripts and operations", () => {
  const mutations = [
    (p: any) => (p.groups[0].fields[0].field = "nationalId"),
    (p: any) => (p.groups[0].fields[0].renderer = "javascript"),
    (p: any) => (p.groups[0].fields[0].renderer = "date"),
    (p: any) => (p.sectionKey = "addresses"),
    (p: any) => (p.groups[0].html = "<script>alert(1)</script>"),
    (p: any) => (p.actions[0].href = "javascript:alert(1)"),
    (p: any) => p.groups.push(p.groups[0]),
  ];
  for (const mutate of mutations) {
    const profile = structuredClone(contact);
    mutate(profile);
    assert.throws(() =>
      parseEntityRecordPresentation({ ...presentation, related: [profile] }),
    );
  }
  const changed = structuredClone(presentation) as any;
  changed.related[0].actions[0].operationKey = "unregistered";
  assert.throws(
    () =>
      validateRecordPresentationReferences(
        changed,
        ["display_name", "status", "code"],
        presentation.actions.map((a) => a.operationKey),
      ),
    /Unknown record presentation operation/,
  );
  assert.equal(
    readableRecordPresentation(
      presentation,
      ["display_name"],
      [],
      "display_name",
    ).related,
    undefined,
  );
});
test("address history is readable and collapsed, date-only values are timezone stable", () => {
  const html = renderToStaticMarkup(
    <RelatedRecord
      profile={address}
      values={{
        purpose: "default",
        lines: ["230 Jalan Demo"],
        locality: "Kuala Lumpur",
        countryCode: "MY",
        effectiveFrom: "2025-01-01",
        validationStatus: "valid",
        events: [
          {
            eventType: "VALIDATION_RECORDED",
            occurredAt: "2026-08-30T00:00:00Z",
          },
        ],
      }}
    />,
  );
  assert.match(html, /Malaysia/);
  assert.match(html, /Address validated/);
  assert.match(html, /Jan 1, 2025/);
  assert.match(html, /<details><summary>Validation history/);
  assert.doesNotMatch(html, /VALIDATION_RECORDED|2026-08-30T/);
});
test("redacted fields are excluded from titles, missing counts, channels and formatted addresses", () => {
  const html = renderToStaticMarkup(
    <RelatedRecord
      profile={contact}
      values={values}
      restrictedFields={["displayName", "departmentName", "channels.value"]}
    />,
  );
  assert.doesNotMatch(
    html,
    /Nur Aisyah|Operations|nur@example|601234|mailto:|tel:/,
  );
  assert.match(html, /Additional fields \(1\)/);
  const postal = renderToStaticMarkup(
    <RelatedRecord
      profile={address}
      values={{ formattedAddress: "secret address", lines: ["secret line"] }}
      restrictedFields={["formattedAddress", "lines"]}
    />,
  );
  assert.doesNotMatch(postal, /secret/);
});
test("action metadata only renders server-authorized local operation links", () => {
  assert.doesNotMatch(
    renderToStaticMarkup(<RelatedRecord profile={contact} values={values} />),
    /Request contact change/,
  );
  assert.match(
    renderToStaticMarkup(
      <RelatedRecord
        profile={contact}
        values={values}
        actions={[{ operationKey: "amend_partner", href: "/mdg/request" }]}
      />,
    ),
    /Request contact change/,
  );
  assert.doesNotMatch(
    renderToStaticMarkup(
      <RelatedRecord
        profile={contact}
        values={values}
        actions={[{ operationKey: "amend_partner", href: "//evil.test" }]}
      />,
    ),
    /Request contact change/,
  );
  assert.equal(safeChannelHref("website", "javascript:alert(1)"), undefined);
  assert.equal(
    safeChannelHref("email", "a@example.test?bcc=secret"),
    undefined,
  );
  assert.equal(
    safeChannelHref("email", "a@example.test\r\nInjected"),
    undefined,
  );
});
test("missing fields disclosure, copy controls and retry work with keyboard-native buttons", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  let copied = "",
    retries = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (v: string) => {
        copied = v;
      },
    },
  });
  const host = document.getElementById("root")!,
    root = createRoot(host);
  try {
    await act(async () =>
      root.render(<RelatedRecord profile={contact} values={values} />),
    );
    const disclosure = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Additional fields"),
    )!;
    assert.equal(disclosure.getAttribute("aria-expanded"), "false");
    await act(async () => disclosure.click());
    assert.equal(disclosure.getAttribute("aria-expanded"), "true");
    assert.match(host.textContent!, /Not provided/);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Copy contact value: email"]',
        )!
        .click(),
    );
    assert.equal(copied, "nur@example.test");
    assert.match(host.textContent!, /Copied/);
    await act(async () =>
      root.render(
        <RelatedSectionError
          label="Addresses"
          supportReference="request-123"
          retry={() => retries++}
        />,
      ),
    );
    await act(async () => host.querySelector("button")!.click());
    assert.equal(retries, 1);
    assert.match(host.textContent!, /request-123/);
    await act(async () =>
      root.render(
        <RelatedSectionError
          label="Addresses"
          restricted
          retry={() => retries++}
        />,
      ),
    );
    assert.equal(host.querySelector("button"), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("compact summaries omit field-list headings and keep visible labels metadata driven", () => {
  const html = renderToStaticMarkup(
    <RelatedRecord
      profile={contact}
      values={values}
      compact
      summaryFooter={<button>View all contacts</button>}
    />,
  );
  const dom = new JSDOM(html);
  const text = dom.window.document.body.textContent!;
  assert.doesNotMatch(
    text,
    /Contact channels|Contact value|Channel verification|Purpose|Contact details/,
  );
  assert.match(text, /Nur Aisyah/);
  assert.match(text, /Email/);
  assert.match(text, /Not verified/);
  assert.equal(dom.window.document.querySelectorAll("dl").length, 0);
  assert.equal(
    dom.window.document.querySelectorAll(".a-related-copy").length,
    2,
  );
  dom.window.close();
  const postal = renderToStaticMarkup(
    <RelatedRecord
      profile={address}
      values={{
        purpose: "billing",
        lines: ["230 Jalan Demo"],
        locality: "Kuala Lumpur",
        postalCode: "50450",
        countryCode: "MY",
        validationStatus: "unverified",
      }}
      compact
    />,
  );
  assert.match(postal, /Copy address/);
  assert.match(postal, /Not verified/);
  assert.doesNotMatch(postal, /<h4>|<dl>|Validation history|Effective from/);
});

test("summary layouts reject mismatched sources and unpublished field references", () => {
  for (const mutate of [
    (p: any) => (p.summary.layout = "postal-summary"),
    (p: any) => (p.summary.fields = ["channels.secret"]),
    (p: any) => (p.summary.fields = ["channels.verified"]),
    (p: any) => (p.summary.fields = ["identity.businessTitle"]),
    (p: any) => (p.summary.html = "<script />"),
  ]) {
    const profile = structuredClone(contact);
    mutate(profile);
    assert.throws(() =>
      parseEntityRecordPresentation({ ...presentation, related: [profile] }),
    );
  }
});

test("copy address copies only the displayed postal block, including after redaction", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  let copied = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (v: string) => {
        copied = v;
      },
    },
  });
  const host = document.getElementById("root")!,
    root = createRoot(host);
  const value = {
    purpose: "default",
    formattedAddress: "Secret line, London",
    lines: ["Secret line"],
    locality: "London",
    postalCode: "SW1A 1AA",
    countryCode: "GB",
    validationStatus: "valid",
  };
  try {
    await act(async () =>
      root.render(
        <RelatedRecord
          profile={address}
          values={value}
          compact
          restrictedFields={["lines"]}
        />,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Copy address"]')!
        .click(),
    );
    assert.equal(
      copied,
      [...host.querySelectorAll("address>div")]
        .map((line) => line.textContent)
        .join("\n"),
    );
    assert.doesNotMatch(copied, /Secret/);
    assert.match(copied, /London/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("detail metadata moves badges into headers, selects placement and weights, and rejects invalid bindings", () => {
  const html = renderToStaticMarkup(
    <RelatedRecord profile={contact} values={values} hideScope />,
  );
  const dom = new JSDOM(html).window.document;
  assert.equal(
    dom.querySelector(".a-related-detail__heading .a-badge")?.textContent,
    "Primary",
  );
  assert.equal(dom.querySelectorAll("[role=columnheader]").length, 3);
  assert.equal(dom.querySelectorAll("[role=row]").length, 3);
  assert.equal(dom.querySelectorAll("dt").length, 1);
  assert.doesNotMatch(html, /Shared Business Partner/);
  assert.match(html, /minmax\(0,4fr\)/);
  for (const change of [
    (p: any) => (p.detail.headerFields = ["channels.verified"]),
    (p: any) => (p.detail.layout = "postal-detail"),
    (p: any) => (p.groups[1].detail.columnWeights = [1, "calc(100vw)", 1, 1]),
    (p: any) => (p.groups[0].detail.omitFields = ["unknown"]),
    (p: any) => (p.detail.script = "alert(1)"),
  ]) {
    const profile = structuredClone(contact);
    change(profile);
    assert.throws(() =>
      parseEntityRecordPresentation({ ...presentation, related: [profile] }),
    );
  }
  const altered = structuredClone(contact) as any;
  altered.detail.headerFields = [];
  altered.groups[0].detail.showLabel = true;
  altered.groups[0].label = "Published group heading";
  const changed = renderToStaticMarkup(
    <RelatedRecord profile={altered} values={values} />,
  );
  assert.match(changed, /Published group heading/);
  assert.match(changed, /<dt>Assignment<\/dt>/);
});

test("postal details avoid repeated purpose and isolate restricted metadata", () => {
  const html = renderToStaticMarkup(
    <RelatedRecord
      profile={address}
      values={{
        purpose: "correspondence",
        primary: false,
        lines: ["1 Main Street"],
        countryCode: "GB",
        validationStatus: "valid",
        effectiveFrom: "2026-09-05",
      }}
      restrictedFields={["validationStatus"]}
      hideScope
    />,
  );
  const dom = new JSDOM(html).window.document;
  assert.equal(
    dom.querySelector(".a-related-detail__heading h3")?.textContent,
    "Correspondence",
  );
  assert.equal(
    dom.querySelector(".a-related-detail__heading .a-badge")?.textContent,
    "Additional",
  );
  assert.equal(dom.querySelectorAll("dt").length, 1);
  assert.equal(
    dom.querySelector(".a-related-detail__aside dt")?.textContent,
    "Effective from",
  );
  assert.ok(dom.querySelector('[aria-label="Copy address"]'));
  assert.doesNotMatch(html, /Postal validation|<dt>Purpose/);
});

test("external reference names resolve by system and preserve unmapped identifiers", () => {
  const profile = presentation.related!.find(
    (p) => p.source === "external-reference.v1",
  )!;
  const row = {
    sourceSystemCode: "athyper_mesh",
    externalEntityCode: "network_account",
    externalId: "c2452ba4-5f07-5214-863f-2b5212a557bf",
  };
  const render = (
    values: Record<string, unknown>,
    restrictedFields: string[] = [],
  ) =>
    renderToStaticMarkup(
      <RelatedRecord
        profile={profile}
        values={values}
        restrictedFields={restrictedFields}
        hideScope
      />,
    );
  const html = render(row);
  assert.match(html, /Athyper Mesh/);
  assert.match(html, /Network account/);
  assert.match(html, /c2452ba4-5f07-5214-863f-2b5212a557bf/);
  assert.doesNotMatch(html, /athyper_mesh|network_account|<dt>External code/);
  const other = render({ ...row, sourceSystemCode: "another_system" });
  assert.match(other, /another_system/);
  assert.match(other, /network_account/);
  assert.doesNotMatch(other, /Network account/);
  const restricted = render(row, ["sourceSystemCode", "externalId"]);
  assert.doesNotMatch(restricted, /Athyper Mesh|Network account|c2452ba4/);
  for (const change of [
    (p: any) => (p.groups[0].fields[1].lookup.scopeField = "unknown"),
    (p: any) => (p.groups[0].fields[1].lookup.url = "https://example.test"),
    (p: any) => (p.detail.layout = "contact-detail"),
    (p: any) =>
      (p.groups[0].fields[1].lookup.values.athyper_mesh.network_account = {
        script: "bad",
      }),
  ]) {
    const bad = structuredClone(profile);
    change(bad);
    assert.throws(() =>
      parseEntityRecordPresentation({ ...presentation, related: [bad] }),
    );
  }
});

test("network code is prominent while the exact linking UUID remains in collapsed technical details", () => {
  const profile = presentation.related!.find(p => p.source === 'external-reference.v1')!;
  const html = renderToStaticMarkup(<RelatedRecord profile={profile} values={{sourceSystemCode:'athyper_mesh',externalEntityCode:'network_account',externalCode:'dev-northwind-supplies',externalId:'c2452ba4-5f07-5214-863f-2b5212a557bf'}} hideScope />);
  const doc = new JSDOM(html).window.document;
  assert.match(doc.querySelector('.a-related-detail__main')!.textContent!, /Network account code.*dev-northwind-supplies/);
  assert.doesNotMatch(doc.querySelector('.a-related-detail__main')!.textContent!, /c2452ba4/);
  const details = doc.querySelector('details')!;
  assert.equal(details.hasAttribute('open'),false);
  assert.equal(details.querySelector('summary')?.textContent,'Technical details');
  assert.match(details.textContent!, /c2452ba4-5f07-5214-863f-2b5212a557bf/);
});
