import { PublicationContractError } from "./errors.js";

/** Published logical projection; never accepts SQL/storage coordinates or executable code. */
export interface ActivityCollectionBinding {
  readonly sectionKey: string;
  readonly maximumRecords: number;
  readonly manualCapture?: {
    readonly coverage: "required" | "optional";
    readonly consistency: "transaction" | "independent";
  };
  readonly definition: {
    readonly key: string;
    readonly sourceEntity: string;
    readonly sourceContract: string;
    readonly scope: string;
    readonly identityField: string;
    readonly targetField?: string;
    readonly fields: readonly {
      readonly key: string;
      readonly comparison: "json" | "decimal";
    }[];
  };
}
export function parseActivityCollections(
  value: unknown,
): readonly ActivityCollectionBinding[] {
  const fail = (): never => {
    throw new PublicationContractError(
      "ENTITY_CAPABILITY_INVALID",
      "activity collections: invalid binding",
    );
  };
  const obj = (v: unknown, keys: readonly string[]) => {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).some((k) => !keys.includes(k))
    )
      fail();
    return v as Record<string, unknown>;
  };
  const key = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !/^[a-z][a-z0-9_.-]{0,126}$/.test(v) ||
      ["constructor", "prototype", "__proto__"].includes(v)
    )
      fail();
    return v as string;
  };
  if (!Array.isArray(value) || value.length > 8) fail();
  const seen = new Set<string>(),
    sections = new Set<string>();
  for (const raw of value as unknown[]) {
    const item = obj(raw, [
      "sectionKey",
      "maximumRecords",
      "definition",
      "manualCapture",
    ]);
    if (item.manualCapture !== undefined) {
      const policy = obj(item.manualCapture, ["coverage", "consistency"]);
      if (
        !["required", "optional"].includes(String(policy.coverage)) ||
        !["transaction", "independent"].includes(String(policy.consistency))
      )
        fail();
    }
    const section = key(item.sectionKey);
    if (sections.has(section)) fail();
    sections.add(section);
    if (
      !Number.isSafeInteger(item.maximumRecords) ||
      Number(item.maximumRecords) < 1 ||
      Number(item.maximumRecords) > 1000
    )
      fail();
    const d = obj(item.definition, [
      "key",
      "sourceEntity",
      "sourceContract",
      "scope",
      "identityField",
      "targetField",
      "fields",
    ]);
    const name = key(d.key);
    if (seen.has(name)) fail();
    seen.add(name);
    key(d.sourceEntity);
    key(d.identityField);
    if (d.targetField !== undefined) key(d.targetField);
    if (
      typeof d.sourceContract !== "string" ||
      !/^[a-f0-9]{64}$/.test(d.sourceContract) ||
      typeof d.scope !== "string" ||
      !d.scope.trim() ||
      d.scope.length > 256
    )
      fail();
    if (!Array.isArray(d.fields) || !d.fields.length || d.fields.length > 128)
      fail();
    const fields = new Set<string>();
    for (const rawField of d.fields as unknown[]) {
      const f = obj(rawField, ["key", "comparison"]);
      const k = key(f.key);
      if (fields.has(k) || !["json", "decimal"].includes(String(f.comparison)))
        fail();
      fields.add(k);
    }
    if (
      !fields.has(String(d.identityField)) ||
      (d.targetField !== undefined && !fields.has(String(d.targetField)))
    )
      fail();
  }
  return structuredClone(value) as readonly ActivityCollectionBinding[];
}
