/** Preserve repeated filters and saved-view identifiers when canonicalizing a route. */
export function entityRouteAlias(destination:string,params:Readonly<Record<string,string|string[]|undefined>>):string {
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(params)) for(const item of Array.isArray(value)?value:value===undefined?[]:[value]) query.append(key,item);
  return `${destination}${query.size?`?${query}`:""}`;
}
