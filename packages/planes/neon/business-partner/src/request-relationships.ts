export interface AddressDraft {
  readonly key: string;
  readonly purpose: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly isPrimary: boolean;
}

export interface ContactDraft {
  readonly key: string;
  readonly contactName: string;
  readonly businessTitle: string;
  readonly departmentName: string;
  readonly isPrimary: boolean;
  readonly channels: readonly Readonly<{ key: string; channelType: string; value: string; purpose: string; isPrimary: boolean }>[];
}

export interface RequestRelationshipExtensions {
  readonly addresses: readonly Readonly<Record<string, unknown>>[];
  readonly contactPersons: readonly Readonly<Record<string, unknown>>[];
  readonly contactChannels: readonly Readonly<Record<string, unknown>>[];
}

export function newAddress(index=0):AddressDraft{return{key:index===0?"address-1":itemKey("address"),purpose:"default",line1:"",line2:"",city:"",region:"",postalCode:"",countryCode:"",isPrimary:index===0};}
export function newContact(index=0):ContactDraft{return{key:index===0?"contact-1":itemKey("contact"),contactName:"",businessTitle:"",departmentName:"",isPrimary:index===0,channels:[{key:index===0?"channel-1":itemKey("channel"),channelType:"email",value:"",purpose:"default",isPrimary:true}]};}

export async function buildRelationshipExtensions(addresses:readonly AddressDraft[],contacts:readonly ContactDraft[]):Promise<RequestRelationshipExtensions>{
  return Object.freeze({
    addresses:Object.freeze(await Promise.all(addresses.map(async item=>Object.freeze({clientItemKey:item.key,definitionFieldCode:"address.primary",purpose:item.purpose,addressKind:"street",line1:item.line1.trim(),...(item.line2.trim()?{line2:item.line2.trim()}:{}),city:item.city.trim(),...(item.region.trim()?{region:item.region.trim()}:{}),...(item.postalCode.trim()?{postalCode:item.postalCode.trim()}:{}),countryCode:item.countryCode.toUpperCase(),isPrimary:item.isPrimary,normalizedHash:await sha256([item.line1,item.line2,item.city,item.region,item.postalCode,item.countryCode].map(value=>value.trim().toLowerCase()).join("|"))})))),
    contactPersons:Object.freeze(contacts.map(item=>Object.freeze({clientItemKey:item.key,definitionFieldCode:"contact.primary",contactName:item.contactName.trim(),...(item.businessTitle.trim()?{businessTitle:item.businessTitle.trim()}:{}),...(item.departmentName.trim()?{departmentName:item.departmentName.trim()}:{}),isPrimary:item.isPrimary}))),
    contactChannels:Object.freeze(contacts.flatMap(contact=>contact.channels.map(channel=>Object.freeze({clientItemKey:channel.key,definitionFieldCode:`contact.channel.${channel.channelType}`,contactClientItemKey:contact.key,channelType:channel.channelType,value:channel.value.trim(),purpose:channel.purpose,isPrimary:channel.isPrimary})))),
  });
}

function itemKey(prefix:string):string{return `${prefix}-${globalThis.crypto.randomUUID()}`;}
async function sha256(value:string):Promise<string>{const bytes=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}
