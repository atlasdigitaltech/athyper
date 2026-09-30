/** Keep the real, interactive header aligned inside its horizontal scroll container.
 * Native vertical sticky cannot follow page scrolling through an overflow:auto ancestor.
 */
export function attachStickyTableHeader(wrapper: HTMLElement): () => void {
  const table = wrapper.querySelector('table');
  const head = table?.tHead;
  const panel = wrapper.closest('.a-entity-list__panel');
  const toolbar = panel?.querySelector<HTMLElement>('.a-entity-list__chrome');
  const view = wrapper.ownerDocument.defaultView;
  if (!table || !head || !toolbar || !view) return () => {};
  let translation = 0;
  let frame: number | undefined;
  const update = () => {
    frame = undefined;
    // Mobile uses labeled record cards and a visually hidden table header.
    if (view.getComputedStyle(head).position === 'absolute') {
      translation = 0;
      head.style.removeProperty('--entity-heading-offset');
      return;
    }
    const headerRect = head.getBoundingClientRect();
    const naturalTop = headerRect.top - translation;
    const tableRect = table.getBoundingClientRect();
    const selection = panel?.querySelector<HTMLElement>('.a-entity-list__selection-bar');
    const targetTop = Math.max(toolbar.getBoundingClientRect().bottom, selection?.getBoundingClientRect().bottom ?? 0);
    const maximum = Math.max(0, tableRect.bottom - headerRect.height - naturalTop);
    const next = Math.max(0, Math.min(targetTop - naturalTop, maximum));
    if (next !== translation) {
      translation = next;
      head.style.setProperty('--entity-heading-offset', `${next}px`);
    }
  };
  const schedule = () => {
    if (frame !== undefined) return;
    if (view.requestAnimationFrame) frame = view.requestAnimationFrame(update);
    else update();
  };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
  for (const element of [wrapper, table, head, toolbar, panel]) if (element) observer?.observe(element);
  view.addEventListener('scroll', schedule, {passive:true, capture:true});
  view.addEventListener('resize', schedule, {passive:true});
  update();
  return () => {
    if (frame !== undefined) view.cancelAnimationFrame(frame);
    observer?.disconnect();
    view.removeEventListener('scroll', schedule, true);
    view.removeEventListener('resize', schedule);
    head.style.removeProperty('--entity-heading-offset');
  };
}
