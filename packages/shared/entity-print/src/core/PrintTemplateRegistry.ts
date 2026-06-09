// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPrintTemplate = (props: any) => any;

const _registry = new Map<string, AnyPrintTemplate>();

export const PrintTemplateRegistry = {
  register(entityCode: string, component: AnyPrintTemplate): void {
    _registry.set(entityCode, component);
  },
  resolve(entityCode: string): AnyPrintTemplate | null {
    return _registry.get(entityCode) ?? null;
  },
  has(entityCode: string): boolean {
    return _registry.has(entityCode);
  },
};
