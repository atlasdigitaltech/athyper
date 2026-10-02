import { parseEntitySectionComponent, type EntitySectionComponentV1 } from "./section-component";
export interface EntityFormSectionV1 {
  readonly component?: EntitySectionComponentV1;
  readonly key: string;
  readonly label: string;
  readonly fields: readonly string[];
}
/** Runtime sections may reference only fields already admitted by the server. */
export function parseEntityFormSections(value: unknown, fieldKeys: readonly string[]): readonly EntityFormSectionV1[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError('Invalid form sections');
  const keys = new Set<string>(), used = new Set<string>();
  const sections = value.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['key','label','fields','component'].includes(key)) || typeof item.key !== 'string' || !/^[a-z][a-z0-9_.-]{0,126}$/.test(item.key) || keys.has(item.key) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 200 || !Array.isArray(item.fields) || !item.fields.length) throw new TypeError('Invalid form section');
    keys.add(item.key);
    for (const field of item.fields) {
      if (typeof field !== 'string' || !fieldKeys.includes(field) || used.has(field)) throw new TypeError('Invalid form section field');
      used.add(field);
    }
    return Object.freeze({ key: item.key, label: item.label, fields: Object.freeze([...item.fields]) as readonly string[], ...(item.component === undefined ? {} : {component: parseEntitySectionComponent(item.component, item.fields)}) });
  });
  return Object.freeze(sections);
}
