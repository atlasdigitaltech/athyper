/** Preserve explicit destination deep links; discard inherited state on an in-place entity switch. */
export function entityLocationSearch(previous: {entityCode:string;pathname:string}|undefined, entityCode:string, location:Pick<Location,"pathname"|"search">):string {
  return previous && previous.entityCode !== entityCode && previous.pathname === location.pathname ? "" : location.search;
}
