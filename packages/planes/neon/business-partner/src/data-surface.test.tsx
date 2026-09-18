// @vitest-environment jsdom
import {IntlProvider} from "../../../../platform/foundation/i18n/src/react";
import {createEffectiveLocalization} from "../../../../platform/foundation/i18n/src/index";
import {entityEnglishMessages} from "../../../../platform/foundation/i18n/src/entity-messages";
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, it, expect } from "vitest";
import {
  EntityIntakeForm,
  EntityDataSurface,
  dataSurfaceDefaults,
  dataSurfaceValues,
} from "@athyper/platform-entity-form-detail";
import {
  parseEntityIntakeSurfaces,
  compileEntityIntakeSurfaces,
  type EntityIntakeSurfaceV1,
} from "@athyper/contract-platform-entity-runtime";
import {
  businessPartnerDataSurfaces,
  withBusinessPartnerDataSurfaces,
} from "../../../../../server/db/scripts/provisioning/business-partner-data-surfaces";
import { createBusinessPartnerFoundationDefinition } from "../../../../../server/packages/services/publication/src/business-partner-foundation-definition";
import { requestFormFromSurface } from "./meta-request-form";
import {
  serializeRequestForm,
  type RequestFormDescriptor,
} from "./request-form-descriptor";
import {
  buildRelationshipExtensions,
  type AddressDraft,
  type ContactDraft,
} from "./request-relationships";
const legacy = createBusinessPartnerFoundationDefinition({
  request: "1".repeat(64),
  eligibility: "2".repeat(64),
  meshProfile: "3".repeat(64),
  meshMatch: "4".repeat(64),
}).formDescriptors.supplierRequest as unknown as RequestFormDescriptor;
const authored = businessPartnerDataSurfaces(legacy);
function hydrated() {
  return authored.map((s) => ({
    ...s,
    sections: s.sections.map((section) => ({
      ...section,
      fields: section.fields.map((f) =>
        f.control === "input" && f.lookup?.sourceKey
          ? {
              ...f,
              lookup: {
                ...f.lookup,
                options: [
                  { value: "DE", label: "Germany" },
                  { value: "MY", label: "Malaysia" },
                ],
              },
            }
          : f,
      ),
    })),
  }));
}
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis.crypto, "subtle", {
    value: webcrypto.subtle,
    configurable: true,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function Demo({
  surfaces = hydrated(),
  initial,
}: {
  surfaces?: readonly EntityIntakeSurfaceV1[];
  initial?: Record<string, unknown>;
}) {
  const surface = surfaces[0]!;
  const [answers, setAnswers] = useState(
    initial ?? dataSurfaceDefaults(surface, surfaces),
  );
  return (
    <form>
      <EntityDataSurface
        surface={surface}
        surfaces={surfaces}
        answers={answers}
        onChange={setAnswers}
        handlers={{
          "business_partner.organization": (p) => (
            <input
              aria-label={p.field.label}
              name={p.name}
              value={String(p.value)}
              onChange={(e) => p.onChange(e.target.value)}
            />
          ),
        }}
      />
    </form>
  );
}
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  )!;
it("imports published identity bindings and reuses native compiler without changing author edits", () => {
  const source = {
    entity: { entityCode: "business_partner" },
    fields: [{id:"canonical-name",fieldKey:"name",valueOrigin:"stored",storagePath:"name"}],
    operations: [],
  } as any;
  const graph = withBusinessPartnerDataSurfaces(source, legacy);
  const compiled = compileEntityIntakeSurfaces(graph as any);
  expect(compiled).toHaveLength(4);
  expect(compiled[0]!.sections[1]!.fields).toHaveLength(
    legacy.sections[1]!.fields.length,
  );
  expect(
    graph.fields.filter(f=>f.id!=="canonical-name").every((f) => f.valueOrigin === "runtime" && !f.storagePath),
  ).toBe(true);
  expect(withBusinessPartnerDataSurfaces(graph, legacy)).toEqual(graph);
  expect(JSON.stringify(compiled)).not.toContain("United Kingdom");
});
it("renders country master options and nested labels through the shared renderer", async () => {
  await act(async () => root.render(<Demo />));
  expect(container.textContent).toContain("Organization identity");
  expect(container.textContent).toContain("Communication channels");
  const country = container.querySelector<HTMLInputElement>('input[role="combobox"][aria-label="Registration country"]')!;
  await act(async () => country.click());
  expect(document.querySelector('[role="listbox"]')!.textContent).toContain("Germany");
  expect(document.querySelector('[role="listbox"]')!.textContent).not.toContain("United States");
  expect(container.querySelector('input[type="hidden"][name="registrationCountryCode"]')).not.toBeNull();
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(3);
});
it("keeps stable identities, enforces bounds, and transfers primary on removal", async () => {
  await act(async () => root.render(<Demo />));
  const first = container
    .querySelector('input[name$=".line1"]')!
    .getAttribute("name");
  await act(async () => button("Add address").click());
  expect(container.querySelectorAll('input[name$=".line1"]')).toHaveLength(2);
  expect(
    container.querySelector('input[name$=".line1"]')!.getAttribute("name"),
  ).toBe(first);
  await act(async () => button("Remove address").click());
  expect(container.querySelectorAll('input[name$=".line1"]')).toHaveLength(1);
  expect(
    container.querySelector<HTMLInputElement>('input[type="radio"]')!.checked,
  ).toBe(true);
  expect(button("Remove address").disabled).toBe(true);
  await act(async () => button("Add channel").click());
  expect(
    container.querySelectorAll('select[name$=".channelType"]'),
  ).toHaveLength(2);
});
it("rejects unavailable countries, duplicate primaries, missing required fields, and excessive nested items", () => {
  const surfaces = hydrated(),
    surface = surfaces[2]!;
  const initial = dataSurfaceDefaults(surface, surfaces) as any;
  expect(() => dataSurfaceValues(surface, surfaces, initial)).toThrow(
    "Contact name is required",
  );
  initial.contactName = "Test";
  initial.channels[0].value = "a@example.test";
  const good = dataSurfaceValues(surface, surfaces, initial);
  expect(good.contactName).toBe("Test");
  initial.channels.push({ ...initial.channels[0], key: "other" });
  expect(() => dataSurfaceValues(surface, surfaces, initial)).toThrow(
    "one primary",
  );
  initial.channels = Array.from({ length: 11 }, (_, i) => ({
    ...initial.channels[0],
    key: String(i),
    isPrimary: i === 0,
  }));
  expect(() => dataSurfaceValues(surface, surfaces, initial)).toThrow(
    "between 1 and 10",
  );
  const address = surfaces[1]!;
  expect(() =>
    dataSurfaceValues(address, surfaces, {
      ...dataSurfaceDefaults(address, surfaces),
      line1: "Road",
      city: "City",
      countryCode: "XX",
    }),
  ).toThrow("available option");
});
it("rejects cyclic surfaces, unsafe sources, and duplicate answer bindings", () => {
  const cycle = structuredClone(authored) as any;
  cycle[2].sections[0].fields.at(-1).itemSurfaceKey = "intake_details";
  delete cycle[2].sections[0].fields.at(-1).primaryField;
  delete cycle[2].sections[0].fields.at(-1).primaryLabel;
  expect(() => parseEntityIntakeSurfaces(cycle)).toThrow(/cyclic/);
  const bad = structuredClone(authored) as any;
  bad[1].sections[0].fields[1].lookup.sourceKey = "arbitrary.sql";
  expect(() => parseEntityIntakeSurfaces(bad)).toThrow(/UNREGISTERED/);
  const duplicate = structuredClone(authored) as any;
  duplicate[1].sections[0].fields[1].valueKey = "purpose";
  expect(() => parseEntityIntakeSurfaces(duplicate)).toThrow(/duplicate/);
});
it("preserves identity serialization and relationship payload mappings", async () => {
  const surfaces = hydrated(),
    details = surfaces[0]!,
    descriptor = requestFormFromSurface(details),
    data = new FormData();
  for (const [k, v] of Object.entries({
    operatingOrganizationId: "org",
    name: "Company",
    legalName: "Company Ltd",
    registrationCountryCode: "MY",
    ownershipClass: "external",
    supplierType: "general",
    qualificationTypeCode: "compliance",
  }))
    data.set(k, v);
  expect(serializeRequestForm(descriptor, data)).toEqual(
    serializeRequestForm(legacy, data),
  );
  const values = dataSurfaceDefaults(details, surfaces) as any;
  values.addresses[0] = {
    ...values.addresses[0],
    line1: " Road ",
    city: " City ",
    countryCode: "MY",
  };
  values.contacts[0] = {
    ...values.contacts[0],
    contactName: " Person ",
    channels: [
      { ...values.contacts[0].channels[0], value: " person@example.test " },
    ],
  };
  const result = await buildRelationshipExtensions(
    values.addresses as AddressDraft[],
    values.contacts as ContactDraft[],
  );
  expect(result.addresses[0]).toMatchObject({
    line1: "Road",
    city: "City",
    countryCode: "MY",
    isPrimary: true,
  });
  expect(result.contactChannels[0]).toMatchObject({
    contactClientItemKey: values.contacts[0].key,
    value: "person@example.test",
    definitionFieldCode: "contact.channel.email",
  });
});
it("reuses the collection control for Invoice line items with metadata-only label and bound changes", async () => {
  const surfaces = parseEntityIntakeSurfaces([
    {
      schemaVersion: 1,
      key: "invoice",
      title: "Invoice",
      columns: 1,
      sections: [
        {
          key: "lines",
          title: "Invoice lines",
          fields: [
            {
              control: "repeatableGroup",
              key: "lines",
              valueKey: "lines",
              label: "Lines",
              itemLabel: "Line",
              addLabel: "Add invoice line",
              removeLabel: "Remove line",
              itemSurfaceKey: "line",
              minItems: 1,
              maxItems: 2,
              columnSpan: 12,
            },
          ],
        },
      ],
    },
    {
      schemaVersion: 1,
      key: "line",
      title: "Line",
      columns: 1,
      sections: [
        {
          key: "fields",
          fields: [
            {
              control: "input",
              key: "description",
              valueKey: "description",
              label: "Line description",
              widget: "text",
              required: true,
              columnSpan: 12,
            },
          ],
        },
      ],
    },
  ])!;
  await act(async () => root.render(<Demo surfaces={surfaces} />));
  await act(async () => button("Add invoice line").click());
  expect(button("Add invoice line").disabled).toBe(true);
  expect(container.querySelectorAll("input")).toHaveLength(2);
});

it("applies authored label, required, layout and visibility changes without entity UI changes", async () => {
  const surfaces=structuredClone(hydrated()) as any;
  const registered=surfaces[0].sections[1].fields.find((f:any)=>f.valueKey==='name');
  registered.label='Organization name';registered.required=false;registered.columnSpan=6;
  await act(async()=>root.render(<Demo surfaces={surfaces}/>));
  const input=container.querySelector<HTMLInputElement>('input[name="name"]')!;
  expect(container.querySelector(`label[for="${input.id}"]`)!.textContent).toBe('Organization name');
  expect(input.required).toBe(false);expect(input.closest<HTMLElement>('.a-data-surface__field')!.style.getPropertyValue('--data-span')).toBe('6');
  const ownership=container.querySelector<HTMLSelectElement>('select[name="ownershipClass"]')!;
  await act(async()=>{ownership.value='internal';ownership.dispatchEvent(new Event('change',{bubbles:true}))});
  expect(container.querySelector('select[name="qualificationTypeCode"]')).toBeNull();
});

it("shows inline metadata validation, focuses invalid fields, and preserves overlong input", async()=>{
 const surface:EntityIntakeSurfaceV1={schemaVersion:1,key:"details",title:"Details",columns:1,sections:[{key:"identity",fields:[{control:"input",key:"name",valueKey:"name",label:"Registered name",required:true,widget:"text",columnSpan:1,maxLength:100}]}]};
 function Form(){const [answers,setAnswers]=useState({name:""});return <EntityIntakeForm detailsStep="details" reviewStep="review" onSubmit={e=>e.preventDefault()}><EntityDataSurface surface={surface} surfaces={[surface]} answers={answers} onChange={v=>setAnswers(v as {name:string})}/><button type="submit">Continue</button></EntityIntakeForm>;}
 await act(async()=>root.render(<IntlProvider localization={createEffectiveLocalization({uiLocale:"en",formatLocale:"en"})} messages={entityEnglishMessages}><Form/></IntlProvider>));
 const input=container.querySelector('input')!;
 expect(container.textContent).not.toContain("Registered name is required.");
 await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const summaryLink=container.querySelector<HTMLAnchorElement>('.a-validation-summary a')!;
 expect(summaryLink.textContent).toContain("Registered name is required.");
 await act(async()=>summaryLink.click());
 expect(container.querySelector('.a-field-error')?.textContent).toContain("Registered name is required.");
 expect(input.getAttribute('aria-invalid')).toBe('true');expect(document.activeElement).toBe(input);
 expect(input.hasAttribute('maxlength')).toBe(false);
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'x'.repeat(101));input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(input.value.length).toBe(101);expect(container.querySelector('.a-field-error')?.textContent).toContain('100 characters or fewer');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Valid name');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(container.querySelector('.a-field-error')).toBeNull();
});

it("updates nested address requiredness when the parent profile mode changes", async () => {
  const surfaces = parseEntityIntakeSurfaces([
    {schemaVersion: 1, key: "details", title: "Details", columns: 1, sections: [{key: "fields", fields: [
      {control: "input", key: "profile_mode", valueKey: "profileMode", label: "Profile mode", required: true, widget: "select", columnSpan: 6, defaultValue: "standard", lookup: {options: [{value: "standard", label: "Standard"}, {value: "full", label: "Full"}]}},
      {control: "repeatableGroup", key: "addresses", valueKey: "addresses", label: "Addresses", itemLabel: "Address", addLabel: "Add address", removeLabel: "Remove address", itemSurfaceKey: "address", minItems: 1, maxItems: 2, columnSpan: 12, itemFieldRules: [{when: {field: "profile_mode", operator: "equals", value: "full"}, fields: ["line1"], required: false}]},
    ]}]},
    {schemaVersion: 1, key: "address", title: "Address", columns: 1, sections: [{key: "fields", fields: [{control: "input", key: "line1", valueKey: "line1", label: "Address line 1", widget: "text", required: true, columnSpan: 12}]}]},
  ])!;
  await act(async () => root.render(<Demo surfaces={surfaces} />));
  const line = () => container.querySelector<HTMLInputElement>('input[name$="line1"]')!;
  expect(line().required).toBe(true);
  const mode = container.querySelector<HTMLSelectElement>('select[name="profileMode"]')!;
  await act(async () => {mode.value = "full"; mode.dispatchEvent(new Event("change", {bubbles: true}));});
  expect(line().required).toBe(false);
  await act(async () => {mode.value = "standard"; mode.dispatchEvent(new Event("change", {bubbles: true}));});
  expect(line().required).toBe(true);
});
