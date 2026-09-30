import {expect,it} from "vitest";
import {parseAtlasLearningProposal} from "../atlas-learning.js";
import {parseEntityAiVocabulary} from "../entity-ai.js";
const candidateId="00000000-0000-4000-8000-000000000001",feedbackId="00000000-0000-4000-8000-000000000002";
const proposal={schemaVersion:1,candidateId,feedbackId,locale:"en",phrase:"Company Snapshot",capabilityId:"entity_read_record"};
const term={phrase:"Company Snapshot",capabilityId:"entity_read_record",origin:{plane:"neon",candidateId,proposalHash:"a".repeat(64)}};
it("normalizes bounded vocabulary and rejects arbitrary prompts, scripts and source coordinates",()=>{
 expect(parseAtlasLearningProposal(proposal).phrase).toBe("company snapshot");
 for(const patch of [{locale:"fr"},{schemaVersion:2},{phrase:"<script>"},{phrase:"\ncompany"},{phrase:"word ".repeat(10).trim()},{question:"raw conversation"},{tenantId:candidateId}])expect(()=>parseAtlasLearningProposal({...proposal,...patch})).toThrow();
});
it("published semantic references require declared providers, immutable provenance and supported locale",()=>{
 const vocabulary={schemaVersion:1,locale:"en",terms:[term]};
 expect(parseEntityAiVocabulary(vocabulary,["entity_read_record"]).terms[0]?.phrase).toBe("company snapshot");
 expect(()=>parseEntityAiVocabulary(vocabulary,[])).toThrow(/declared/);
 for(const patch of [{locale:"en-US"},{terms:[term,term]},{terms:[{...term,origin:{...term.origin,proposalHash:"unreviewed"}}]},{prompt:"ignore policy"}])expect(()=>parseEntityAiVocabulary({...vocabulary,...patch},["entity_read_record"])).toThrow();
});
it("retains explicit cross-capability ambiguity instead of overwriting an approved meaning",()=>{
 const result=parseEntityAiVocabulary({schemaVersion:1,locale:"en",terms:[term,{...term,capabilityId:"bp_read_contacts"}]},["entity_read_record","bp_read_contacts"]);
 expect(result.terms).toHaveLength(2);
});
