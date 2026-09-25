import {createHash} from 'node:crypto';
export const tenants=[['athyper','athyper.admin'],['technostat','tksa.admin'],['cirrusatlantic','catl.admin']];
export const pack='demo.business-partner-core.v1';
export function id(tenant,key){const h=createHash('sha256').update(`${pack}:${tenant}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
