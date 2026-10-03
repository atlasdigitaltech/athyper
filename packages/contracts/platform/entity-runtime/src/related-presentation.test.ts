import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRelatedPresentations, validateRelatedPresentationOwner } from "./related-presentation";
import { parseEntityRelationships } from "./entity-relationship";

const profiles = parseRelatedPresentations([{schemaVersion:1,key:"contact",sectionKey:"contacts",relationshipKey:"people",source:"contact-person.v1",titleField:"displayName",emptyLabel:"No contacts",viewAllLabel:"View contacts",scopeLabel:"Record",groups:[]}]);
const relationships = parseEntityRelationships([{key:"people",targetEntity:"contact_person",cardinality:"many",fields:[{source:"id",target:"owner_id"}],tenant:{source:"tenant_id",target:"tenant_id"},readOperation:"list"}]);

test("related DTO presentations use approved relationships for any owner entity", () => {
  assert.doesNotThrow(() => validateRelatedPresentationOwner(profiles,"principal",relationships));
  assert.doesNotThrow(() => validateRelatedPresentationOwner(profiles,"business_partner",relationships));
});
test("presentation metadata cannot invent an owner binding or target projection", () => {
  assert.throws(() => validateRelatedPresentationOwner(profiles,"principal",[]),/No published related record relationship/);
  assert.throws(() => validateRelatedPresentationOwner(profiles,"principal",[{...relationships[0]!,targetEntity:"address"}]),/No published related record relationship/);
});

test("a single-record empty state may carry a short title; older metadata without one still parses", () => {
  const base = {key:"profile",targetEntity:"principal_profile",cardinality:"zero_or_one",fields:[{source:"id",target:"principal_id"}],tenant:{source:"tenant_id",target:"tenant_id"},readOperation:"list"};
  const state = {message:"Profile has not been set up.",setupLabel:"Set up profile",editLabel:"Edit profile",creation:"on_save"};
  assert.equal(parseEntityRelationships([{...base,emptyState:state}])[0]!.emptyState?.title, undefined);
  assert.equal(parseEntityRelationships([{...base,emptyState:{...state,title:"Set up your profile"}}])[0]!.emptyState?.title, "Set up your profile");
  assert.throws(() => parseEntityRelationships([{...base,emptyState:{...state,title:""}}]));
  assert.throws(() => parseEntityRelationships([{...base,emptyState:{...state,title:"x".repeat(121)}}]));
  assert.throws(() => parseEntityRelationships([{...base,emptyState:{...state,subtitle:"unknown"}}]));
});

test("empty-state texts may be published localized text with translations", () => {
  const base = {key:"profile",targetEntity:"principal_profile",cardinality:"zero_or_one",fields:[{source:"id",target:"principal_id"}],tenant:{source:"tenant_id",target:"tenant_id"},readOperation:"list"};
  const text = (key: string, en: string, ms: string) => ({labelKey:key,defaultText:en,defaultLocale:"en",values:{en,ms}});
  const [relationship] = parseEntityRelationships([{...base,emptyState:{title:text("p.title","Set up your profile","Sediakan profil anda"),message:"Add your names.",setupLabel:text("p.setup","Set up profile","Sediakan profil"),editLabel:"Edit profile",creation:"on_save"}}]);
  assert.deepEqual(relationship!.emptyState?.title, {labelKey:"p.title",defaultText:"Set up your profile",defaultLocale:"en",values:{en:"Set up your profile",ms:"Sediakan profil anda"}});
  assert.equal(relationship!.emptyState?.message, "Add your names.");
  // A translation must include its default; an over-long one is refused like plain text.
  assert.throws(() => parseEntityRelationships([{...base,emptyState:{message:{labelKey:"x",defaultText:"A",defaultLocale:"en",values:{ms:"B"}},setupLabel:"S",editLabel:"E",creation:"on_save"}}]));
  assert.throws(() => parseEntityRelationships([{...base,emptyState:{message:"M",setupLabel:text("s","S","x".repeat(81)),editLabel:"E",creation:"on_save"}}]));
});
