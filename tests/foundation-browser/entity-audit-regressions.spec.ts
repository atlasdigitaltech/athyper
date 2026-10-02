import { resolve } from "node:path";
import { build } from "esbuild";
import { test, expect } from "@playwright/test";
import type { EntityListDescriptorV1, EntityListResultV1 } from "@athyper/contract-platform-entity-list";
const digest = (value: string) => value.repeat(64).slice(0, 64);
function descriptor(scopeFingerprint: string): EntityListDescriptorV1 {
  const enabled = {
    state: "enabled" as const,
    requiresPreflight: false,
    requiresApproval: false,
  };
  const hidden = {
    state: "hidden" as const,
    requiresPreflight: false,
    requiresApproval: false,
  };
  return {
    schemaVersion: 1,
    plane: "neon",
    entity: {
      code: "business_partner",
      label: "Business Partner",
      pluralLabel: "Business Partners",
      identityField: "code",
      detailRouteTemplate: "/mdg/business-partner/:recordId",
    },
    revision: {
      release: 2,
      descriptorHash: digest("a"),
      surfaceHash: digest("b"),
    },
    surface: {
      key: "default_list",
      title: "Business Partners",
      header: {
        title: {
          defaultLocale: "ms",
          values: { ms: "Rakan Perniagaan", en: "Business Partners" },
        },
        description: {
          defaultLocale: "ms",
          values: { ms: "Direktori rakan yang dibenarkan." },
        },
      },
      description: "Scoped partners",
      defaultState: {
        filters: [],
        sort: [{ field: "code", direction: "asc" }],
        columns: ["code", "name", "status"],
        density: "comfortable",
        mode: "table",
      },
      supportedModes: ["table", "compact"],
      search: { minimumQueryLength: 1 },
      filterPresentation: {
        quickFields: [{ field: "status", defaultOperator: "eq" }],
        source: "metadata",
        allowUserPinning: true,
      },
    },
    fields: [
      {
        key: "code",
        label: "Business Partner Code",
        valueKind: "string",
        semanticRole: "identity",
        defaultVisible: true,
        defaultOrder: 0,
        filterOperators: ["contains", "eq"],
        sortable: true,
        groupable: false,
        aggregations: [],
      },
      {
        key: "name",
        label: "Display Name",
        valueKind: "string",
        semanticRole: "title",
        defaultVisible: true,
        defaultOrder: 1,
        filterOperators: ["contains"],
        sortable: true,
        groupable: false,
        aggregations: [],
      },
      {
        key: "status",
        label: "Status",
        valueKind: "enum",
        semanticRole: "status",
        filterOptions: [
          { value: "active", label: "Active" },
          { value: "draft", label: "Draft" },
        ],
        defaultVisible: true,
        defaultOrder: 2,
        filterOperators: ["eq", "in"],
        sortable: true,
        groupable: true,
        aggregations: [],
      },
    ],
    actions: [
      {
        key: "create_request",
        label: "Legacy label",
        localizedLabel: {
          defaultLocale: "ms",
          values: { ms: "Permohonan baharu" },
        },
        placement: "primary",
        selection: "none",
        execution: "navigate",
        state: "enabled",
        href: "/requests/new",
        requiresPreflight: false,
        supportsAllMatching: false,
      },
      {
        key: "restricted",
        label: "Restricted action",
        placement: "secondary",
        selection: "none",
        execution: "navigate",
        state: "hidden",
        requiresPreflight: false,
        supportsAllMatching: false,
      },
      {
        key: "context_action",
        label: "Select context",
        placement: "secondary",
        selection: "none",
        execution: "navigate",
        state: "disabled",
        disabledReason: {
          code: "CONTEXT_REQUIRED",
          messageKey: "entity.action.context_required",
        },
        disabledMessage: {
          defaultLocale: "en",
          values: { en: "Choose an organization first." },
        },
        requiresPreflight: false,
        supportsAllMatching: false,
      },
    ],
    dataOperations: {
      workspaceHref: "/operations/data-transfers",
      export: {
        currentPage: enabled,
        selected: enabled,
        filtered: hidden,
        all: hidden,
        formats: ["csv", "json", "ndjson"],
        defaultFormat: "csv",
        exportableFields: ["code", "name", "status"],
        asynchronousThreshold: 5000,
      },
      import: {
        create: hidden,
        update: hidden,
        upsert: hidden,
        downloadTemplate: hidden,
        formats: ["csv", "json"],
        defaultFormat: "csv",
        importableFields: [],
        maxFileBytes: 1024,
        maxRows: 100,
        draftOnly: false,
      },
    },
    scope: {
      status: "ready",
      labels: [
        {
          key: "organization",
          label: "Operating organization",
          value: "Operations",
        },
      ],
      fingerprint: scopeFingerprint,
    },
    limits: {
      defaultPageSize: 10,
      allowedPageSizes: [10, 25],
      maxSortLevels: 1,
      countMode: "none",
    },
  };
}
function page(scopeFingerprint: string, code: string): EntityListResultV1 {
  return {
    schemaVersion: 1,
    descriptorHash: digest("a"),
    scopeFingerprint,
    queryHash: digest("d"),
    rows: [
      {
        id: `${code}-id`,
        values: { code, name: `${code} Partner`, status: "active" },
      },
    ],
    pagination: {
      pageSize: 1,
      hasNext: false,
      hasPrevious: false,
      countMode: "none",
    },
  };
}


const script = build({stdin:{resolveDir:process.cwd(), loader:"tsx", contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {EntityListRuntime, EntityNavigationProvider} from './packages/platform/entity/runtime/list-view/src/index';
import {entityListDescriptorOperation,recordBookmarkMembershipOperation} from './packages/platform/foundation/api-client/src/index';
window.paths=[]; window.requests=[]; window.navigations=[]; window.opened=[];
const client={request:async(operation,options)=>{ window.paths.push(operation.path(options?.params));
 if(operation===entityListDescriptorOperation)return window.descriptor;
 if(operation===recordBookmarkMembershipOperation)return new Set();
 window.requests.push(options?.query);
 if(window.delay)return new Promise(resolve=>window.finish=()=>resolve(window.rows));
 return window.rows;
}};
window.mount=()=>createRoot(document.getElementById('root')).render(<EntityNavigationProvider navigate={href=>window.navigations.push(href)}><EntityListRuntime client={client} entityCode="business_partner" contentOnly onOpenRecord={row=>window.opened.push(row.id)}/></EntityNavigationProvider>);
`},tsconfig:resolve("tooling/config/tsconfig-react.json"),bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",loader:{".css":"empty"}}).then(result=>result.outputFiles[0]!.text);
async function mount(page: import('@playwright/test').Page, workspace = true) {
 await page.goto('about:blank');
 await page.route('https://neon.test/**', route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('https://neon.test/manage');
 const base=descriptor(digest('b'));
 const enabled={state:"enabled" as const,requiresPreflight:false,requiresApproval:false};
 const config={...base,plane:workspace ? "neon" : "studio",dataOperations:{workspaceHref:workspace ? "/operations/data-transfers" : undefined,export:{currentPage:enabled,selected:enabled,filtered:enabled,all:enabled,formats:["csv"],defaultFormat:"csv",exportableFields:["code"],asynchronousThreshold:1000},import:{create:enabled,update:enabled,upsert:enabled,downloadTemplate:enabled,formats:["csv"],defaultFormat:"csv",importableFields:["code"],maxFileBytes:1000,maxRows:100,draftOnly:false}}};
 await page.evaluate(({config,rows})=>{Object.assign(window,{descriptor:config,rows});},{config,rows:pageResult()});
 await page.addScriptTag({content:await script});
 await page.evaluate(()=>(window as any).mount());
 await expect(page.locator('.a-entity-list__record-link').first()).toBeVisible();
}
function pageResult(){return page(digest('b'),'BP');}
test('embedded record opening preserves general transfer navigation',async({page})=>{
 await mount(page);
 await page.locator('.a-entity-list__record-link').first().click();
 expect(await page.evaluate(()=>(window as any).opened)).toEqual(['BP-id']);
 await page.getByRole('button',{name:'Controls',exact:true}).click();
 await page.getByRole('menuitem',{name:/Data operations/}).click();
 await page.getByRole('button',{name:'View imports and exports'}).click();
 expect(await page.evaluate(()=>(window as any).navigations)).toContain('/operations/data-transfers');
});
test('a second column filter preserves the first pending mutation',async({page})=>{
 await mount(page);
 await page.evaluate(()=>(window as any).delay=true);
 await page.getByRole('button',{name:'Filter Status',exact:true}).click();
 await page.getByRole('dialog',{name:'Filter Status',exact:true}).getByRole('combobox',{name:'Value for Status filter 1'}).click();
 await page.getByRole('option',{name:/^Draft/}).click();
 await page.getByRole('dialog',{name:'Filter Status'}).getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('button',{name:'Filter Display Name',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Filter Display Name'});
 await dialog.locator('input[aria-label^="Value"]').fill('Acme');
 await dialog.getByRole('button',{name:'Apply',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).requests.at(-1)?.filter?.map((value: string)=>JSON.parse(value)))).toEqual(expect.arrayContaining([{field:'status',operator:'eq',value:'draft'},{field:'name',operator:'contains',value:'Acme'}]));
});

test('a plane without a transfer workspace never renders dead links',async({page})=>{
 await mount(page,false);
 await page.getByRole('button',{name:'Controls',exact:true}).click();
 await page.getByRole('menuitem',{name:/Data operations/}).click();
 await expect(page.getByRole('dialog',{name:'Data operations'})).toBeVisible();
 await expect(page.getByRole('button',{name:'View imports and exports'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Import from file'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Current page/})).toBeEnabled();
});
