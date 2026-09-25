// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createHttpClient } from "@athyper/platform-api-client";
import { CorePartnerRegistration } from "./core-registration";
const state = vi.hoisted(() => ({
  http: undefined as unknown,
  tenant: "catl",
  allowed: true,
  personAllowed: true,
}));
vi.mock("@athyper/platform-shell-app-foundation", () => ({
  useApiClient: () => state.http,
  usePermissions: () => ({ has: (code: string) => state.allowed && (code !== "neon.relationship.business_partner_person.read" || state.personAllowed) }),
  useSessionIdentity: () => ({
    state: "authenticated",
    scope: { tenantId: state.tenant, principalId: "maker" },
  }),
  readBrowserCsrfToken: () => "csrf",
}));
const transport = vi.fn<typeof fetch>();
let container: HTMLDivElement, root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.tenant = "catl";
  state.allowed = true;
  state.personAllowed = true;
  transport.mockReset();
  state.http = createHttpClient({ fetch: transport, csrfToken: () => "csrf" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<CorePartnerRegistration />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function input(label: string, value: string) {
  const node = [...container.querySelectorAll("label")]
    .find((n) => n.textContent?.startsWith(label))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("captures only tenant core identity and preserves the retry key after timeout", async () => {
  await input("Legal name", "Aster Demo");
  await input("Partner code", "BP-UI-DEMO");
  transport.mockRejectedValue(new Error("Timeout"));
  const form = container.querySelector("form")!;
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  const bodies = transport.mock.calls.map((c) =>
    JSON.parse(String(c[1]?.body)),
  );
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0]).not.toHaveProperty("requestedRole");
  expect(bodies[0]).not.toHaveProperty("companyCodeId");
  expect(bodies[0]).not.toHaveProperty("operatingOrganizationId");
  expect(bodies[0].proposedPayload.name).toBe("Aster Demo");
});
it("captures an authorized existing person without organization-only fields",async()=>{
  const select=container.querySelector('select')!;
  await act(async()=>{select.value='person';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await input('Display name','Rowan Example');
  await input('Partner code','BP-PERSON-TEST');
  await input('Existing tenant-local person ID','11111111-1111-4111-8111-111111111111');
  expect(container.textContent).not.toContain('Registration country');
  transport.mockRejectedValue(new Error('Timeout'));
  await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  const body=JSON.parse(String(transport.mock.calls[0]![1]?.body));
  expect(body.proposedPayload).toEqual({name:'Rowan Example',businessPartnerCode:'BP-PERSON-TEST',partnerCategory:'person',ownershipClass:'external',personId:'11111111-1111-4111-8111-111111111111'});
});
it("does not offer person linking without the separate person permission",async()=>{
  state.personAllowed=false;
  await act(async()=>root.render(<CorePartnerRegistration/>));
  expect([...container.querySelectorAll('select option')].map(option=>option.textContent)).toEqual(['Organization']);
});
it("clears tenant drafts on identity changes and hides creation without dedicated permission", async () => {
  await input("Legal name", "Private CATL draft");
  state.tenant = "other";
  await act(async () => root.render(<CorePartnerRegistration />));
  expect(
    [...container.querySelectorAll("input")].some(
      (n) => n.value === "Private CATL draft",
    ),
  ).toBe(false);
  state.allowed = false;
  await act(async () => root.render(<CorePartnerRegistration />));
  expect(container.textContent).not.toContain("Create registration draft");
});
it("does not expose commercial cases through the registration review screen", async () => {
  await input("Case ID", "commercial");
  transport.mockResolvedValue(
    Response.json({
      request: {
        id: "commercial",
        kind: "new_partner",
        requestedRole: "supplier",
      },
    }),
  );
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((n) => n.textContent === "Load registration")!
      .click(),
  );
  expect(container.textContent).toContain(
    "only tenant-level core registration",
  );
  expect(container.textContent).not.toContain("Materialize approved partner");
});
