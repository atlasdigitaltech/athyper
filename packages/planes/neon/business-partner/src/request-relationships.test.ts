import {describe,expect,it}from"vitest";
import {buildRelationshipExtensions,newAddress,newContact}from"./request-relationships.js";

describe("request relationship components",()=>{
 it("serializes repeatable address and contact rows with stable typed coordinates",async()=>{const address={...newAddress(),line1:" 1 Main Street ",city:"London",countryCode:"gb"},contact={...newContact(),contactName:" Ada Buyer ",channels:[{...newContact().channels[0]!,value:"ada@example.test"}]};const result=await buildRelationshipExtensions([address],[contact]);expect(result.addresses[0]).toMatchObject({line1:"1 Main Street",city:"London",countryCode:"GB",isPrimary:true,normalizedHash:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(result.contactPersons[0]).toMatchObject({contactName:"Ada Buyer",isPrimary:true});expect(result.contactChannels[0]).toMatchObject({contactClientItemKey:contact.key,channelType:"email",value:"ada@example.test",isPrimary:true});});
});
