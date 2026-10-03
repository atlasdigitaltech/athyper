import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEffectiveLocalization, createIntlRuntime } from "../../packages/platform/foundation/i18n/src/index";
import { entityMessages, entityFallbackMessages } from "../../packages/platform/foundation/i18n/src/entity-catalogs";
import { localizeEntityLabels } from "../../packages/platform/foundation/i18n/src/entity-labels";
import { localizeEntityErrorModel, localizedEntityError } from "../../packages/platform/foundation/i18n/src/entity-errors";
import { formatEntityValue } from "../../packages/platform/foundation/i18n/src/entity-value";
import { collaborationMessages } from "../../packages/platform/foundation/i18n/src/catalogs/collaboration";
import { parsePresentationLocalization, readablePresentationLocalization } from "../../packages/contracts/platform/entity-runtime/src/presentation-localization";
import { readableRecordPresentation } from "../../packages/contracts/platform/entity-runtime/src/record-presentation";
import { parseEntityListDescriptor } from "../../packages/contracts/platform/entity-list/src/parsers";
import { compiledReference, referenceSource, referenceDetail, referenceList } from "../../tooling/scripts/verification/localized-reference-fixture";

const intl = (locale: string) => createIntlRuntime({localization:createEffectiveLocalization({uiLocale:locale,formatLocale:locale,timeZone:"Asia/Kuala_Lumpur"}),messages:entityMessages(locale),fallbackMessages:entityFallbackMessages});
describe("localized entity vertical slice",()=>{
  for(const plane of ["studio","neon","mesh"] as const) it(`preserves Country references through source, compiler, serialization and ${plane} runtime parser`,()=>{
    const descriptor=compiledReference(undefined,plane);
    assert.equal(descriptor.listPresentation?.localizedLabels?.title?.labelKey,"entity.country.title");
    assert.equal(descriptor.listPresentation?.localizedLabels?.title?.values?.ms,"Negara");
    assert.equal(Object.keys(descriptor.recordPresentation!.localizedLabels!.fields).length,22);
    assert.equal(descriptor.recordPresentation!.sections[0]!.localizedLabel!.labelKey,"entity.country.sections.overview");
  });
  for(const [locale,entity,name] of [["en","Country","Name"],["ms","Negara","Nama"],["ar","البلد","الاسم"]]) it(`projects authorized browser labels in ${locale} without mutating cached descriptors`,async()=>{
    const descriptor=await referenceDetail(), before=JSON.stringify(descriptor);
    const projected=localizeEntityLabels(descriptor,intl(locale!));
    assert.equal(projected.entity.label,entity);
    assert.equal(projected.fields.find(field=>field.key==="name")?.label,name);
    assert.equal(JSON.stringify(descriptor),before);
    assert.notEqual(projected,descriptor);
  });
  it("preserves legacy string sources and descriptors with no plural label",()=>{
    const source=referenceSource();delete source.definition.entityLabel;
    source.definition.title=source.definition.title.defaultText;
    for(const row of [...source.definition.fields,...source.definition.sections]) row.label=row.label.defaultText;
    delete source.definition.navigation.tabs[0].localizedLabel;
    const descriptor=compiledReference(source);
    assert.equal(descriptor.recordPresentation?.localizedLabels,undefined);
    assert.equal(localizeEntityLabels({entity:{label:"Legacy"}},intl("ar")).entity.label,"Legacy");
    const withoutLocalization = (value: unknown) => JSON.parse(JSON.stringify(value,(key,item)=>["localizedLabels","localizedLabel","contractHash","compiledHash"].includes(key)?undefined:item));
    assert.deepEqual(withoutLocalization(compiledReference()),withoutLocalization(descriptor));
  });
  it("carries Country title and field references through the actual authorized list service",async()=>{
    const descriptor=await referenceList();
    const projected=localizeEntityLabels(descriptor,intl("ms"));
    assert.equal(projected.surface.title,"Negara");
    assert.equal(projected.fields.find(field=>field.key==="name")?.label,"Nama");
    assert.equal(descriptor.fields.find(field=>field.key==="name")?.label,"Name");
  });
  it("does not leak labels of unreadable fields or hidden sections",()=>{
    const presentation=compiledReference().recordPresentation!;
    const readable=readableRecordPresentation(presentation,["name"],["read"],"name");
    assert.deepEqual(Object.keys(readable.localizedLabels!.fields),["name"]);
    assert.equal(readable.sections.length,1);
    assert.deepEqual(Object.keys(readablePresentationLocalization(presentation.localizedLabels,[])!.fields),[]);
  });
  it("rejects invalid references and contradictory authoring rather than silently choosing",()=>{
    assert.throws(()=>parsePresentationLocalization({fields:{name:{labelKey:"INVALID KEY",defaultText:"Name"}}}));
    const source=referenceSource();source.definition.fields[0].localizedLabel={labelKey:"other.name",defaultText:"Other"};
    assert.throws(()=>compiledReference(source));
  });
  it("uses published entity text then literal authored fallback; never translates record data",()=>{
    assert.equal(intl("ms-MY").text({labelKey:"entity.country.fields.name",defaultText:"Name",defaultLocale:"en",values:{en:"Name",ms:"Nama",ar:"الاسم"}}),"Nama");
    assert.equal(intl("ar").text({labelKey:"missing.label",defaultText:"Literal {name}"}),"Literal {name}");
    assert.equal(intl("ar").text("Afghanistan"),"Afghanistan");
    assert.equal(intl("ar").text({labelKey:"constructor",defaultText:"Literal fallback"}),"Literal fallback");
    assert.equal(intl("fr").message("comments.showReplies",{count:0}),"Show 0 replies");
    const fallback=createIntlRuntime({localization:createEffectiveLocalization({uiLocale:"ar"}),messages:{},fallbackMessages:{count:"{count, plural, one {one} other {other}}"}});
    assert.equal(fallback.message("count",{count:2}),"other");
  });
  it("formats counts, dates and numbers using governed localization",()=>{
    assert.equal(intl("en").message("comments.showReplies",{count:1}),"Show 1 reply");
    assert.equal(intl("en").message("comments.showReplies",{count:2}),"Show 2 replies");
    assert.equal(intl("ar").message("comments.showReplies",{count:2}),"عرض ردين");
    assert.equal(intl("ar").localization.direction,"rtl");
    assert.equal(intl("ar").number(1234),new Intl.NumberFormat("ar").format(1234));
    assert.equal(intl("ms").date("2026-09-28T20:00:00Z",{dateStyle:"short"}),new Intl.DateTimeFormat("ms",{dateStyle:"short",timeZone:"Asia/Kuala_Lumpur"}).format(new Date("2026-09-28T20:00:00Z")));
  });
  it("formats PostgreSQL decimals without losing digits and localizes form actions",()=>{
    assert.equal(formatEntityValue("12345678901234567890.1250",{valueKind:"money"},intl("en")),"12,345,678,901,234,567,890.1250");
    const arabicDigits = createIntlRuntime({localization:createEffectiveLocalization({uiLocale:"ar",formatLocale:"ar",numberingSystem:"arab"}),messages:entityMessages("ar"),fallbackMessages:entityFallbackMessages});
    assert.equal(formatEntityValue("1234.50",{valueKind:"decimal"},arabicDigits),"١٬٢٣٤٫٥٠");
    assert.equal(formatEntityValue("2026-09-30",{valueKind:"date"},createIntlRuntime({localization:createEffectiveLocalization({uiLocale:"en",formatLocale:"en-US",timeZone:"America/Los_Angeles"}),messages:entityMessages("en"),fallbackMessages:entityFallbackMessages})),"Sep 30, 2026");
    assert.equal(intl("ms").message("form.submitCreate",{entity:"Negara"}),"Cipta Negara");
    assert.equal(intl("ar").message("form.titleEdit",{entity:"البلد"}),"تحرير البلد");
    assert.equal(intl("ms").message("list.searchLabel",{entity:"Negara"}),"Cari Negara");
    assert.equal(intl("ar").message("list.activeFilters",{count:2}),"2 عوامل تصفية نشطة");
  });
  it("preserves negative decimals, negative zero and locale bidi signs", () => {
    for (const locale of ["en", "ms", "ar", "fa"]) {
      for (const value of ["-0.25", "-0", "-1.5", "0.25"]) {
        assert.equal(formatEntityValue(value, { valueKind: "decimal" }, intl(locale)),
          new Intl.NumberFormat(locale, { numberingSystem: intl(locale).localization.numberingSystem }).format(Number(value)));
      }
    }
    assert.equal(formatEntityValue("-0.2500", { valueKind: "money" }, intl("en")), "-0.2500");
  });
  it("preserves only validated metadata status tones in list descriptors",async()=>{
    const descriptor=await referenceList();
    const key=descriptor.fields[0]!.key;
    const withTones={...descriptor,fields:descriptor.fields.map(field=>field.key===key?{...field,statusTones:{draft:"warning",active:"success"}}:field)};
    const parsed=parseEntityListDescriptor(withTones);
    assert.deepEqual(parsed.fields.find(field=>field.key===key)?.statusTones,{draft:"warning",active:"success"});
    const invalid={...descriptor,fields:descriptor.fields.map(field=>field.key===key?{...field,statusTones:{draft:"purple"}}:field)};
    assert.throws(()=>parseEntityListDescriptor(invalid));
  });
  it("all shared catalog templates format in all three locales, including Arabic plural categories",()=>{
    for(const locale of ["en","ms","ar"]) for(const key of Object.keys(collaborationMessages)) for(const count of [0,1,2,3,11,100]) {
      const values = Object.fromEntries([...collaborationMessages[key]![0].matchAll(/\{([A-Za-z][A-Za-z0-9_]*)/g)].map(([, name]) => [name, name === "count" ? count : 1]));
      const output=intl(locale).message(key,values);
      assert.ok(output.length,`${locale}:${key}`);
    }
  });
  it("localizes allowlisted error codes and safe parameters, not server-supplied templates",()=>{
    assert.equal(localizedEntityError({problem:{code:"TOO_MANY_FILTERS",errors:{params:{max:20}}}},intl("ms")),intl("ms").message("error.TOO_MANY_FILTERS",{max:20}));
    assert.equal(localizedEntityError({problem:{code:"UNKNOWN",detail:"{malicious}"}},intl("ar"),"Fallback"),"Fallback");
    assert.equal(localizedEntityError({problem:{code:"TOO_MANY_FILTERS",params:{max:"injected"}}},intl("en"),"Fallback"),"Fallback");
  });
  it("keeps denied and missing states distinct in Malay and Arabic",()=>{
    const denied=localizeEntityErrorModel({kind:"permission-denied",title:"Access denied",description:"English"},intl("ms"));
    const missing=localizeEntityErrorModel({kind:"not-found",title:"Not found",description:"English"},intl("ar"));
    assert.equal(denied.title,"Akses ditolak");
    assert.equal(missing.title,"السجل غير موجود");
  });
});

it("projects Principal enum translations through the compiler, server descriptors and both renderers", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseTableEntityProduct, compileTableEntityProduct } = await import("../../server/packages/planes/studio/meta-entity-authoring/src/authoring/table-product");
  const { compileNativeRuntimeProjection } = await import("../../server/packages/platform/metadata/src/native-runtime-projection");
  const { parseEntityRuntimeDescriptor } = await import("../../server/packages/platform/metadata/src/descriptor-parser");
  const { createEntityListService } = await import("../../server/packages/services/records/src/entity-list-service");
  const read = (file: string) => JSON.parse(readFileSync(new URL(`../../metadata/entities/principal/${file}.json`, import.meta.url), "utf8"));
  const product = parseTableEntityProduct(read("definition"), read("localization"));
  for (const plane of ["neon", "mesh", "studio"] as const) {
    const { graph, artifact } = compileTableEntityProduct(product, plane);
    const projection = compileNativeRuntimeProjection({ native: artifact.descriptor,
      registration: {entityCode:"principal",plane,storage:{schema:"master",object:"principal",idField:"id",tenantField:"tenant_id"},columns:graph.fields.map(field=>field.fieldKey)},
      permissions: [...new Set(graph.operationPermissions!.map(binding=>binding.permissionCode))].map(code=>({code,scopeKinds:["tenant"]})),
    });
    const descriptor = parseEntityRuntimeDescriptor({entity_code:"principal",plane_code:plane,release_id:"00000000-0000-4000-8000-000000000001",release_no:1,entity_contract_hash:artifact.contractHash,compiled_hash:artifact.descriptorHash,compiled_json:JSON.parse(JSON.stringify(projection))});
    const context = {planeKey:plane,tenantId:"tenant",principalId:"actor",permissions:{authorizationScopes:[]}} as any;
    const service = createEntityListService({metadata:{getEntityDescriptor:async()=>descriptor},authorizer:{authorize:async()=>({allowed:true}),entityDescriptorSupported:()=>true},listExecutor:{} as never});
    const [list,detail] = await Promise.all([service.descriptor(context,"principal"),service.detailDescriptor(context,"principal")]);
    for (const [locale, active] of [["en","Active"],["ms","Aktif"],["ar","نشط"]]) {
      const runtime=intl(locale!);
      const localizedList=localizeEntityLabels(list,runtime),localizedDetail=localizeEntityLabels(detail,runtime);
      assert.equal(formatEntityValue("active",localizedList.fields.find(field=>field.key==="status"),runtime),active);
      assert.equal(formatEntityValue("active",localizedDetail.fields.find(field=>field.key==="status"),runtime),active);
      assert.equal(formatEntityValue("jit",localizedDetail.fields.find(field=>field.key==="provisioning_source"),runtime),"JIT");
      assert.equal(formatEntityValue("api",localizedList.fields.find(field=>field.key==="provisioning_source"),runtime),"API");
    }
    assert.equal(Boolean(list.dataOperations?.workspaceHref),plane!=="studio");
  }
});
