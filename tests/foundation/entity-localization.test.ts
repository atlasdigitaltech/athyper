import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEffectiveLocalization, createIntlRuntime } from "../../packages/platform/foundation/i18n/src/index";
import { entityMessages, entityFallbackMessages } from "../../packages/platform/foundation/i18n/src/entity-catalogs";
import { localizeEntityLabels } from "../../packages/platform/foundation/i18n/src/entity-labels";
import { localizedEntityError } from "../../packages/platform/foundation/i18n/src/entity-errors";
import { collaborationMessages } from "../../packages/platform/foundation/i18n/src/catalogs/collaboration";
import { parsePresentationLocalization, readablePresentationLocalization } from "../../packages/contracts/platform/entity-runtime/src/presentation-localization";
import { readableRecordPresentation } from "../../packages/contracts/platform/entity-runtime/src/record-presentation";
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
});
