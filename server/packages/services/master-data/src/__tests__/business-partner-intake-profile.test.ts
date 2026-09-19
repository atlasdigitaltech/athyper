import { expect, it } from "vitest";
import { validateProfileIntake } from "../business-partner-intake-profile.js";
import type { EntityIntakeSurfaceV1 } from "@athyper/contract-platform-entity-runtime";
const root: EntityIntakeSurfaceV1 = {
  schemaVersion: 1,
  key: "details",
  title: "Details",
  columns: 1,
  sections: [
    {
      key: "main",
      columns: 12,
      fields: [
        {
          control: "input",
          key: "view_selector",
          valueKey: "chosenView",
          label: "View",
          widget: "text",
          required: false,
          columnSpan: 12,
          defaultValue: "simple",
          payload: { target: "request_only", path: "chosenView" },
        },
        {
          control: "repeatableGroup",
          key: "aliases",
          valueKey: "alternateNames",
          extensionGroup: "aliases",
          label: "Aliases",
          itemLabel: "Alias",
          addLabel: "Add alias",
          removeLabel: "Remove alias",
          itemSurfaceKey: "alias",
          minItems: 0,
          maxItems: 20,
          columnSpan: 12,
          visibleWhen: {
            field: "view_selector",
            operator: "equals",
            value: "complete",
          },
        },
      ],
    },
  ],
};
const child: EntityIntakeSurfaceV1 = {
  schemaVersion: 1,
  key: "alias",
  title: "Alias",
  columns: 1,
  sections: [
    {
      key: "main",
      columns: 12,
      fields: [
        {
          control: "input",
          key: "alias_name",
          valueKey: "aliasName",
          label: "Alias name",
          widget: "text",
          required: true,
          maxLength: 12,
          columnSpan: 12,
        },
      ],
    },
  ],
};
it("validates submitted collections even when the request tries to hide them", () => {
  const command = {
    proposedPayload: { tenantFields: { chosenView: "simple" } },
    extensions: {
      aliases: [{ clientItemKey: "a", definitionFieldCode: "aliases" }],
    },
  } as any;
  expect(() => validateProfileIntake(root, [root, child], command)).toThrow(
    /Alias name/,
  );
  expect(() =>
    validateProfileIntake(root, [root, child], {
      ...command,
      extensions: {
        aliases: [
          {
            clientItemKey: "a",
            definitionFieldCode: "aliases",
            aliasName: "Valid name",
          },
        ],
      },
    }),
  ).not.toThrow();
});
it("allows incomplete draft fields but checks them again for submission",()=>{
 const command={draftCapture:true,proposedPayload:{tenantFields:{chosenView:"simple"}},extensions:{aliases:[{clientItemKey:"a",definitionFieldCode:"aliases"}]}} as any;
 expect(()=>validateProfileIntake(root,[root,child],command)).not.toThrow();
 expect(()=>validateProfileIntake(root,[root,child],{...command,draftCapture:false})).toThrow(/Alias name/);
});
it('validates routing while leaving protected bank masks to protected capture', () => {
 const bankRoot:any={...root,sections:[{key:'bank',columns:12,fields:[{control:'repeatableGroup',key:'banks',valueKey:'bankAccounts',extensionGroup:'bankAccounts',label:'Banks',itemLabel:'Bank',itemSurfaceKey:'bank',minItems:0,maxItems:10,columnSpan:12}]}]};
 const bank:any={...child,key:'bank',sections:[{key:'bank',columns:12,fields:[{control:'input',key:'number',valueKey:'accountIdentifier',label:'IBAN',widget:'password',format:'iban',required:true,columnSpan:6},{control:'input',key:'routing',valueKey:'clearingCode',label:'IFSC',widget:'text',required:true,columnSpan:6}]}]};
 const command:any={proposedPayload:{},extensions:{bankAccounts:[{clientItemKey:'one',maskedValue:'••••7519',clearingCode:'ABCD0123456'}]}};
 expect(()=>validateProfileIntake(bankRoot,[bankRoot,bank],command)).not.toThrow();
 delete command.extensions.bankAccounts[0].clearingCode;
 expect(()=>validateProfileIntake(bankRoot,[bankRoot,bank],command)).toThrow(/IFSC/);
});

it("validates address requiredness from the submitted parent mode, including drafts", () => {
  const details: EntityIntakeSurfaceV1 = {...root, sections: [{key: "main", fields: [
    {control: "input", key: "mode", valueKey: "profileMode", label: "Profile mode", widget: "select", required: false, columnSpan: 12, defaultValue: "standard", payload: {target: "request_only", path: "profileMode"}, lookup: {options: [{value: "standard", label: "Standard"}, {value: "full", label: "Full"}]}},
    {control: "repeatableGroup", key: "addresses", valueKey: "addresses", extensionGroup: "addresses", label: "Addresses", itemLabel: "Address", addLabel: "Add", removeLabel: "Remove", itemSurfaceKey: "address", minItems: 0, maxItems: 20, columnSpan: 12, itemFieldRules: [{when: {field: "mode", operator: "equals", value: "full"}, fields: ["line1", "city"], required: false}]},
  ]}]};
  const address: EntityIntakeSurfaceV1 = {...child, key: "address", sections: [{key: "main", fields: ["line1", "city"].map(key => ({control: "input" as const, key, valueKey: key, label: key, widget: "text" as const, required: true, columnSpan: 12}))}]};
  const validate = (profileMode?: string, draftCapture = false) => validateProfileIntake(details, [details, address], {draftCapture, proposedPayload: {tenantFields: {profileMode}}, extensions: {addresses: [{clientItemKey: "a"}]}} as any);
  expect(() => validate()).toThrow(/line1/);
  expect(() => validate("standard")).toThrow(/line1/);
  expect(() => validate("full")).not.toThrow();
  expect(() => validate("standard", true)).not.toThrow();
});
