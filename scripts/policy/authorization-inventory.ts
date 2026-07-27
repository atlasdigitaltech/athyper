import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const AUTHORIZATION_REGISTRY_PATH =
  "config/governance/authorization-source-registry.v1.json";
export const AUTHORIZATION_INVENTORY_PATH =
  "config/governance/authorization-inventory.v1.json";
export const AUTHORIZATION_SUMMARY_PATH =
  "docs/architecture/authorization-source-inventory.md";

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".prisma",
  ".sql",
  ".ts",
  ".tsx",
]);

const WRITER_ACCESS = new Set<ReferenceAccess>([
  "delete",
  "insert",
  "truncate",
  "update",
]);

export type ReferenceAccess =
  | "define"
  | "delete"
  | "execute"
  | "generate"
  | "insert"
  | "read"
  | "reference"
  | "truncate"
  | "update";

export type ArtifactClass =
  | "contract"
  | "ddl"
  | "generated"
  | "keycloak"
  | "route"
  | "runtime"
  | "seed"
  | "test"
  | "tool"
  | "ui";

export interface AuthorizationRegistryObject {
  id: string;
  database: string;
  qualifiedName: string;
  kind: "function" | "table" | "view";
  authorityClass: string;
  owner: string;
  planes: string[];
  sourceOfTruth: boolean;
  disposition: string;
}

export interface AuthorizationRegistry {
  schemaVersion: 1;
  contract: {
    name: string;
    description: string;
    scanRoots: string[];
    excludedDirectories: string[];
    excludedFiles: string[];
  };
  objects: AuthorizationRegistryObject[];
  securitySymbols: string[];
  contractFields: string[];
  generatedArtifacts: Array<{
    path: string;
    generator: string;
    owner: string;
  }>;
}

interface SourceFile {
  path: string;
  absolutePath: string;
  artifactClass: ArtifactClass;
  content: string;
  scanContent: string;
  sha256: string;
}

interface ObjectReference {
  objectId: string;
  qualifiedName: string;
  path: string;
  artifactClass: ArtifactClass;
  access: ReferenceAccess;
  lines: number[];
}

interface UnknownObjectReference {
  qualifiedName: string;
  path: string;
  artifactClass: ArtifactClass;
  access: ReferenceAccess;
  lines: number[];
}

interface SecuritySymbolReference {
  symbol: string;
  path: string;
  artifactClass: ArtifactClass;
  classification: "reviewed" | "unclassified";
  lines: number[];
}

interface ContractFieldReference {
  field: string;
  path: string;
  artifactClass: ArtifactClass;
  lines: number[];
}

interface PermissionDefinition {
  code: string;
  riskLevel: "low" | "medium" | "high" | "critical" | "unknown";
  sources: Array<{
    path: string;
    lines: number[];
  }>;
}

interface PermissionUse {
  code: string;
  riskLevel: PermissionDefinition["riskLevel"] | "unknown";
  path: string;
  artifactClass: ArtifactClass;
  lines: number[];
}

interface RouteEntry {
  path: string;
  route: string;
  methods: string[];
  permissionCodes: string[];
  securitySymbols: string[];
}

interface DerivedDatabaseObject {
  qualifiedName: string;
  kind: "function" | "trigger" | "view";
  path: string;
  line: number;
  attachedTo?: string;
  executes?: string;
  dependencies: string[];
  classification: "registered" | "structural_dependency" | "unclassified";
}

interface KeycloakMapping {
  path: string;
  jsonPath: string;
  name: string | null;
  mapperType: string;
  userAttribute: string | null;
  claimName: string | null;
  hardcodedRole: string | null;
}

interface GeneratedArtifact {
  path: string;
  generator: string;
  generatorPath: string;
  owner: string;
  present: boolean;
  generatorPresent: boolean;
  sha256: string | null;
}

export interface AuthorizationInventory {
  schemaVersion: 1;
  contract: {
    registry: string;
    registrySha256: string;
    deterministic: true;
    scanRoots: string[];
    excludedDirectories: string[];
    excludedFiles: string[];
  };
  summary: {
    filesScanned: number;
    authorizationFiles: number;
    registeredObjects: number;
    objectReferences: number;
    writerReferences: number;
    securitySymbolReferences: number;
    contractFieldReferences: number;
    permissionDefinitions: number;
    permissionUses: number;
    routes: number;
    keycloakMappings: number;
    derivedDatabaseObjects: number;
    generatedArtifacts: number;
  };
  objects: Array<
    AuthorizationRegistryObject & {
      definitionCount: number;
      readerCount: number;
      writerCount: number;
      executionCount: number;
      files: string[];
    }
  >;
  files: Array<{
    path: string;
    artifactClass: ArtifactClass;
    sha256: string;
  }>;
  references: ObjectReference[];
  securitySymbols: SecuritySymbolReference[];
  contractFields: ContractFieldReference[];
  permissionDefinitions: PermissionDefinition[];
  permissionUses: PermissionUse[];
  routes: RouteEntry[];
  keycloakMappings: KeycloakMapping[];
  derivedDatabaseObjects: DerivedDatabaseObject[];
  generatedArtifacts: GeneratedArtifact[];
  gates: {
    unknownSources: Array<
      | { type: "object"; qualifiedName: string; path: string; access: ReferenceAccess; lines: number[] }
      | { type: "security_symbol"; symbol: string; path: string; lines: number[] }
      | { type: "database_object"; qualifiedName: string; path: string; line: number }
      | { type: "permission_code"; code: string; path: string; lines: number[] }
    >;
    unknownWriters: UnknownObjectReference[];
    unownedObjects: string[];
    unclassifiedWriters: ObjectReference[];
    missingDefinitions: string[];
    generatedArtifactFailures: string[];
  };
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function repoRelative(root: string, value: string): string {
  return normalizePath(relative(root, value));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function blankExceptNewlines(value: string): string {
  return value.replace(/[^\r\n]/gu, " ");
}

export function stripSourceComments(content: string, extension: string): string {
  let result = content.replace(/\/\*[\s\S]*?\*\//gu, blankExceptNewlines);
  if (extension === ".sql" || extension === ".prisma") {
    result = result.replace(/--[^\r\n]*/gu, blankExceptNewlines);
  } else if (extension !== ".json") {
    result = result.replace(/(^|[^:\\])\/\/[^\r\n]*/gmu, (match) =>
      blankExceptNewlines(match));
  }
  return result;
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

export function classifyArtifact(path: string): ArtifactClass {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.includes("/__tests__/")
    || normalized.includes("/tests/")
    || normalized.endsWith(".test.ts")
    || normalized.endsWith(".test.tsx")
    || normalized.endsWith(".spec.ts")
    || normalized.endsWith(".spec.tsx")
  ) return "test";
  if (normalized.startsWith("stack/config/iam/") && normalized.endsWith(".json")) {
    return "keycloak";
  }
  if (
    normalized.endsWith(".prisma")
    || normalized.includes("/_generated/")
    || normalized.includes("/generated/")
    || normalized.includes(".generated.")
  ) return "generated";
  if (normalized.includes("/db/seed/") && normalized.endsWith(".sql")) return "seed";
  if (normalized.includes("/db/ddl/") && normalized.endsWith(".sql")) return "ddl";
  if (
    normalized.includes("/routes/")
    || normalized.includes("/app/api/")
    || normalized.endsWith(".route.ts")
    || normalized.endsWith(".routes.ts")
  ) return "route";
  if (
    normalized.includes("/api-contracts/")
    || normalized.includes("/session-plane/")
    || normalized.includes("/runtime-contracts/")
  ) return "contract";
  if (normalized.endsWith(".tsx") || normalized.endsWith(".jsx")) return "ui";
  if (
    normalized.startsWith("scripts/")
    || normalized.startsWith("tools/")
    || normalized.includes("/db/scripts/")
    || normalized.includes("/scripts/")
  ) return "tool";
  return "runtime";
}

function shouldSkipDirectory(name: string, exclusions: Set<string>): boolean {
  return exclusions.has(name);
}

function discoverFiles(root: string, registry: AuthorizationRegistry): SourceFile[] {
  const exclusions = new Set(registry.contract.excludedDirectories);
  const excludedFiles = new Set(registry.contract.excludedFiles);
  const result: SourceFile[] = [];

  const visit = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && shouldSkipDirectory(entry.name, exclusions)) continue;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      const path = repoRelative(root, absolutePath);
      if (excludedFiles.has(path)) continue;
      const extension = extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(extension)) continue;
      const content = readFileSync(absolutePath, "utf8").replaceAll("\r\n", "\n");
      result.push({
        path,
        absolutePath,
        artifactClass: classifyArtifact(path),
        content,
        scanContent: stripSourceComments(content, extension),
        sha256: hash(content),
      });
    }
  };

  for (const scanRoot of registry.contract.scanRoots) visit(resolve(root, scanRoot));
  return result.sort((left, right) => compareText(left.path, right.path));
}

export function classifyReferenceAccess(
  content: string,
  occurrenceIndex: number,
  qualifiedName: string,
  kind: AuthorizationRegistryObject["kind"] = "table",
): ReferenceAccess {
  const start = Math.max(0, occurrenceIndex - 240);
  const before = content.slice(start, occurrenceIndex);
  const escaped = escapeRegex(qualifiedName);
  const statement = `${before}${qualifiedName}`.toLowerCase();
  const lowerName = qualifiedName.toLowerCase();
  const suffix = statement.slice(Math.max(0, statement.length - lowerName.length - 180));

  if (new RegExp(`create\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?${kind}\\s+(?:if\\s+not\\s+exists\\s+)?${escaped}$`, "iu").test(suffix)) {
    return "define";
  }
  if (/\.insertinto\(\s*["'`]$/iu.test(before) || /insert\s+into\s+$/iu.test(before)) {
    return "insert";
  }
  if (/\.updatetable\(\s*["'`]$/iu.test(before) || /update\s+(?:only\s+)?$/iu.test(before)) {
    return "update";
  }
  if (/\.deletefrom\(\s*["'`]$/iu.test(before) || /delete\s+from\s+$/iu.test(before)) {
    return "delete";
  }
  if (/truncate\s+(?:table\s+)?$/iu.test(before)) return "truncate";
  if (/references\s+$/iu.test(before)) return "reference";
  if (kind === "function") return "execute";
  if (/\.selectfrom\(\s*["'`]$/iu.test(before)) return "read";
  return "read";
}

function aggregateReferences(
  references: Array<Omit<ObjectReference, "lines"> & { line: number }>,
): ObjectReference[] {
  const map = new Map<string, ObjectReference>();
  for (const reference of references) {
    const key = [
      reference.objectId,
      reference.path,
      reference.artifactClass,
      reference.access,
    ].join("\u0000");
    const current = map.get(key);
    if (current) {
      current.lines.push(reference.line);
      continue;
    }
    map.set(key, { ...reference, lines: [reference.line] });
  }
  return [...map.values()]
    .map((item) => ({ ...item, lines: [...new Set(item.lines)].sort((a, b) => a - b) }))
    .sort((left, right) =>
      compareText(left.objectId, right.objectId)
      || compareText(left.path, right.path)
      || compareText(left.access, right.access));
}

function aggregateUnknownObjectReferences(
  references: Array<Omit<UnknownObjectReference, "lines"> & { line: number }>,
): UnknownObjectReference[] {
  const map = new Map<string, UnknownObjectReference>();
  for (const reference of references) {
    const key = [
      reference.qualifiedName,
      reference.path,
      reference.artifactClass,
      reference.access,
    ].join("\u0000");
    const current = map.get(key);
    if (current) current.lines.push(reference.line);
    else map.set(key, { ...reference, lines: [reference.line] });
  }
  return [...map.values()]
    .map((item) => ({ ...item, lines: [...new Set(item.lines)].sort((a, b) => a - b) }))
    .sort((left, right) =>
      compareText(left.qualifiedName, right.qualifiedName)
      || compareText(left.path, right.path)
      || compareText(left.access, right.access));
}

export function isStrongAuthorizationObjectName(qualifiedName: string): boolean {
  const component = qualifiedName.split(".").at(-1) ?? "";
  if (/(?:_ck|_fk|_idx|_pkey|_uq)$/u.test(component)) return false;
  return /(?:^|_)(?:access_grant|access_log|acl|auth|decision_log|delegation|entitlement|feature_grant|identity_binding|identity_domain|identity_provider|permission|persona|principal_relationship|tenant_admin_grant)(?:_|$)/iu.test(component);
}

function isInsideSqlSingleQuotedLiteral(content: string, index: number): boolean {
  let inside = false;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content[cursor] !== "'") continue;
    if (inside && content[cursor + 1] === "'") {
      cursor += 1;
      continue;
    }
    inside = !inside;
  }
  return inside;
}

function scanObjectReferences(
  files: SourceFile[],
  objects: AuthorizationRegistryObject[],
): {
  references: ObjectReference[];
  unknownObjectReferences: UnknownObjectReference[];
} {
  const registeredByName = new Map(
    objects.map((object) => [object.qualifiedName.toLowerCase(), object]),
  );
  const references: Array<Omit<ObjectReference, "lines"> & { line: number }> = [];
  const unknown: Array<Omit<UnknownObjectReference, "lines"> & { line: number }> = [];

  for (const file of files) {
    for (const object of objects) {
      const pattern = new RegExp(
        `(?<![A-Za-z0-9_])${escapeRegex(object.qualifiedName)}(?![A-Za-z0-9_])`,
        "giu",
      );
      for (const match of file.scanContent.matchAll(pattern)) {
        const index = match.index ?? 0;
        references.push({
          objectId: object.id,
          qualifiedName: object.qualifiedName,
          path: file.path,
          artifactClass: file.artifactClass,
          access: classifyReferenceAccess(
            file.scanContent,
            index,
            object.qualifiedName,
            object.kind,
          ),
          line: lineNumberAt(file.scanContent, index),
        });
      }
    }

    const qualifiedPattern =
      /(?<![A-Za-z0-9_])(shared|master|control|snapshot|log|event|mesh|mesh_control|mesh_log)\.([a-z][a-z0-9_]*)(?![A-Za-z0-9_])/giu;
    for (const match of file.scanContent.matchAll(qualifiedPattern)) {
      const qualifiedName = `${match[1]}.${match[2]}`.toLowerCase();
      if (registeredByName.has(qualifiedName) || !isStrongAuthorizationObjectName(qualifiedName)) {
        continue;
      }
      const index = match.index ?? 0;
      if (
        file.path.endsWith(".sql")
        && isInsideSqlSingleQuotedLiteral(file.scanContent, index)
      ) {
        continue;
      }
      const access = classifyReferenceAccess(
        file.scanContent,
        index,
        qualifiedName,
        qualifiedName.includes("fn_") || qualifiedName.includes("check_")
          || qualifiedName.includes("resolve_") || qualifiedName.includes("trg_")
          ? "function"
          : "table",
      );
      unknown.push({
        qualifiedName,
        path: file.path,
        artifactClass: file.artifactClass,
        access,
        line: lineNumberAt(file.scanContent, index),
      });
    }
  }

  return {
    references: aggregateReferences(references),
    unknownObjectReferences: aggregateUnknownObjectReferences(unknown),
  };
}

function scanPrismaReferences(
  files: SourceFile[],
  objects: AuthorizationRegistryObject[],
): ObjectReference[] {
  const registered = new Map(
    objects.filter((object) => object.kind === "table")
      .map((object) => [object.qualifiedName.toLowerCase(), object]),
  );
  const raw: Array<Omit<ObjectReference, "lines"> & { line: number }> = [];
  for (const file of files.filter((item) => item.path.endsWith(".prisma"))) {
    const modelPattern = /\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\}/gmu;
    for (const match of file.scanContent.matchAll(modelPattern)) {
      const body = match[2] ?? "";
      const schema = body.match(/@@schema\("([^"]+)"\)/u)?.[1];
      const mapped = body.match(/@@map\("([^"]+)"\)/u)?.[1] ?? match[1];
      if (!schema || !mapped) continue;
      const object = registered.get(`${schema}.${mapped}`.toLowerCase());
      if (!object) continue;
      raw.push({
        objectId: object.id,
        qualifiedName: object.qualifiedName,
        path: file.path,
        artifactClass: "generated",
        access: "generate",
        line: lineNumberAt(file.scanContent, match.index ?? 0),
      });
    }
  }
  return aggregateReferences(raw);
}

function isSecuritySymbolCandidate(symbol: string): boolean {
  return /^(?:authorize|authorise)[A-Z]/u.test(symbol)
    || /^(?:check|enforce|get|require|resolve)[A-Za-z0-9_$]*(?:Authorization|Permissions?)(?:$|[A-Z])/u.test(symbol)
    || /^(?:enforceAuthorized|resolveAccessContext|resolveAccessScope|resolveAccessibleCompany|getEffectiveModuleAccess|requireAuth|resolveCurrentAuthEpoch)$/u.test(symbol);
}

function scanSecuritySymbols(
  files: SourceFile[],
  reviewedSymbols: string[],
): SecuritySymbolReference[] {
  const reviewed = new Set(reviewedSymbols);
  const map = new Map<string, SecuritySymbolReference>();
  const identifierPattern = /\b[A-Za-z_$][A-Za-z0-9_$]*\b/gu;
  for (const file of files.filter((item) =>
    [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(extname(item.path).toLowerCase()))) {
    for (const match of file.scanContent.matchAll(identifierPattern)) {
      const symbol = match[0];
      if (!reviewed.has(symbol) && !isSecuritySymbolCandidate(symbol)) continue;
      if (
        !reviewed.has(symbol)
        && !/^\s*\(/u.test(file.scanContent.slice((match.index ?? 0) + symbol.length))
      ) {
        continue;
      }
      const classification = reviewed.has(symbol) ? "reviewed" : "unclassified";
      const key = `${symbol}\u0000${file.path}\u0000${classification}`;
      const line = lineNumberAt(file.scanContent, match.index ?? 0);
      const existing = map.get(key);
      if (existing) existing.lines.push(line);
      else {
        map.set(key, {
          symbol,
          path: file.path,
          artifactClass: file.artifactClass,
          classification,
          lines: [line],
        });
      }
    }
  }
  return [...map.values()]
    .map((item) => ({ ...item, lines: [...new Set(item.lines)].sort((a, b) => a - b) }))
    .sort((left, right) =>
      compareText(left.symbol, right.symbol) || compareText(left.path, right.path));
}

function aggregateExactFieldReferences(
  files: SourceFile[],
  fields: string[],
): ContractFieldReference[] {
  const references = new Map<string, ContractFieldReference>();
  for (const file of files) {
    for (const field of fields) {
      const pattern = new RegExp(
        `(?<![A-Za-z0-9_$])${escapeRegex(field)}(?![A-Za-z0-9_$])`,
        "gu",
      );
      for (const match of file.scanContent.matchAll(pattern)) {
        const key = `${field}\u0000${file.path}`;
        const line = lineNumberAt(file.scanContent, match.index ?? 0);
        const current = references.get(key);
        if (current) current.lines.push(line);
        else {
          references.set(key, {
            field,
            path: file.path,
            artifactClass: file.artifactClass,
            lines: [line],
          });
        }
      }
    }
  }
  return [...references.values()]
    .map((item) => ({
      ...item,
      lines: [...new Set(item.lines)].sort((left, right) => left - right),
    }))
    .sort((left, right) =>
      compareText(left.field, right.field) || compareText(left.path, right.path));
}

function scanPermissionDefinitions(files: SourceFile[]): PermissionDefinition[] {
  const definitions = new Map<string, PermissionDefinition>();
  const definitionStatement =
    /\bINSERT\s+INTO\s+shared\.permission(?![A-Za-z0-9_])[\s\S]*?;/giu;
  const permissionCode = /'([A-Z][A-Z0-9_]+(?:\.[A-Z0-9_]+)+)'/gu;

  for (const file of files.filter((item) => item.path.endsWith(".sql"))) {
    for (const statementMatch of file.scanContent.matchAll(definitionStatement)) {
      const statement = statementMatch[0];
      const statementOffset = statementMatch.index ?? 0;
      for (const codeMatch of statement.matchAll(permissionCode)) {
        const code = codeMatch[1];
        if (!code) continue;
        const codeIndex = codeMatch.index ?? 0;
        const riskWindow = statement.slice(codeIndex, codeIndex + 320);
        const riskLevel = riskWindow.match(
          /,\s*'(low|medium|high|critical)'(?:\s*[,)]|\s*::)/u,
        )?.[1] as PermissionDefinition["riskLevel"] | undefined;
        const line = lineNumberAt(file.scanContent, statementOffset + codeIndex);
        const existing = definitions.get(code);
        if (existing) {
          const source = existing.sources.find((item) => item.path === file.path);
          if (source) source.lines.push(line);
          else existing.sources.push({ path: file.path, lines: [line] });
          if (existing.riskLevel === "unknown" && riskLevel) {
            existing.riskLevel = riskLevel;
          }
        } else {
          definitions.set(code, {
            code,
            riskLevel: riskLevel ?? "unknown",
            sources: [{ path: file.path, lines: [line] }],
          });
        }
      }
    }
  }

  return [...definitions.values()]
    .map((definition) => ({
      ...definition,
      sources: definition.sources
        .map((source) => ({
          ...source,
          lines: [...new Set(source.lines)].sort((left, right) => left - right),
        }))
        .sort((left, right) => compareText(left.path, right.path)),
    }))
    .sort((left, right) => compareText(left.code, right.code));
}

function aggregatePermissionUses(
  uses: Array<Omit<PermissionUse, "lines"> & { line: number }>,
): PermissionUse[] {
  const map = new Map<string, PermissionUse>();
  for (const use of uses) {
    const key = `${use.code}\u0000${use.path}\u0000${use.artifactClass}`;
    const current = map.get(key);
    if (current) current.lines.push(use.line);
    else map.set(key, { ...use, lines: [use.line] });
  }
  return [...map.values()]
    .map((item) => ({ ...item, lines: [...new Set(item.lines)].sort((a, b) => a - b) }))
    .sort((left, right) =>
      compareText(left.code, right.code) || compareText(left.path, right.path));
}

function scanPermissionUses(
  files: SourceFile[],
  definitions: PermissionDefinition[],
): { uses: PermissionUse[]; unknownUses: PermissionUse[] } {
  const byCode = new Map(definitions.map((item) => [item.code, item]));
  const uses: Array<Omit<PermissionUse, "lines"> & { line: number }> = [];
  const unknownUses: Array<Omit<PermissionUse, "lines"> & { line: number }> = [];
  const quotePattern = /(["'`])([A-Za-z][A-Za-z0-9._-]*)\1/gu;
  for (const file of files) {
    const pathIsPermissionContext =
      /(?:authorization|entity[_-]operation|iam|permission|access|action-dispatcher|resolver|role|group)/iu.test(file.path);
    for (const match of file.scanContent.matchAll(quotePattern)) {
      const token = match[2];
      if (!token) continue;
      const index = match.index ?? 0;
      const around = file.scanContent.slice(Math.max(0, index - 180), index + 180);
      const contextIsPermission =
        /(?:allowed\.has|checkPermission|required_permission|permission_code|permissionCode|permissions?)/u.test(around);
      const definition = byCode.get(token);
      if (definition) {
        const distinctive = token.includes(".") || /[A-Z]/u.test(token);
        if (!distinctive && !pathIsPermissionContext && !contextIsPermission) continue;
        uses.push({
          code: token,
          riskLevel: definition.riskLevel,
          path: file.path,
          artifactClass: file.artifactClass,
          line: lineNumberAt(file.scanContent, index),
        });
        continue;
      }
      const before = file.scanContent.slice(Math.max(0, index - 500), index);
      const after = file.scanContent.slice(index, index + 260);
      const directAuthorizationContext =
        /(?:checkPermission|checkAnyPermission|requireAllowed|requireAllow|allowed\.has)\s*\([^)]*$/u.test(before)
        || /(?:permissionCode|required_permission|requiredPermission)\s*[:=]\s*$/u.test(before)
        || /permissions\s*:\s*\{[^}]*$/u.test(before)
        || /current_setting\(\s*'app\.permissions'/u.test(after)
        || /002_permission_model/u.test(file.path);
      if (
        directAuthorizationContext
        && /^[A-Z][A-Z0-9_]+(?:\.[A-Z0-9_]+)+$/u.test(token)
        && !token.startsWith("AUTH_")
      ) {
        unknownUses.push({
          code: token,
          riskLevel: "unknown",
          path: file.path,
          artifactClass: file.artifactClass,
          line: lineNumberAt(file.scanContent, index),
        });
      }
    }
  }
  return {
    uses: aggregatePermissionUses(uses),
    unknownUses: aggregatePermissionUses(unknownUses),
  };
}

function routeFromAppFile(path: string): string | null {
  const match = path.match(/^apps\/[^/]+\/app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx)$/u);
  if (!match?.[1]) return null;
  const segments = match[1].split("/")
    .filter((segment) => !segment.startsWith("("))
    .map((segment) => {
      const spread = segment.match(/^\[\.\.\.([^\]]+)\]$/u);
      if (spread) return `:${spread[1]}*`;
      const dynamic = segment.match(/^\[([^\]]+)\]$/u);
      return dynamic ? `:${dynamic[1]}` : segment;
    });
  return `/api/${segments.join("/")}`;
}

function scanRoutes(
  files: SourceFile[],
  permissions: PermissionUse[],
  symbols: SecuritySymbolReference[],
): RouteEntry[] {
  const permissionsByPath = new Map<string, string[]>();
  for (const use of permissions) {
    const list = permissionsByPath.get(use.path) ?? [];
    list.push(use.code);
    permissionsByPath.set(use.path, list);
  }
  const symbolsByPath = new Map<string, string[]>();
  for (const symbol of symbols) {
    const list = symbolsByPath.get(symbol.path) ?? [];
    list.push(symbol.symbol);
    symbolsByPath.set(symbol.path, list);
  }

  const routes: RouteEntry[] = [];
  for (const file of files.filter((item) => item.artifactClass === "route")) {
    const permissionCodes = uniqueSorted(permissionsByPath.get(file.path) ?? []);
    const securitySymbols = uniqueSorted(symbolsByPath.get(file.path) ?? []);
    if (permissionCodes.length === 0 && securitySymbols.length === 0) continue;

    const localRoutes = new Map<string, Set<string>>();
    const expressPattern =
      /\.(get|post|put|patch|delete|head|options|use)\(\s*["'`]([^"'`]+)["'`]/giu;
    for (const match of file.scanContent.matchAll(expressPattern)) {
      const method = (match[1] ?? "use").toUpperCase();
      const route = match[2] ?? "/";
      const methods = localRoutes.get(route) ?? new Set<string>();
      methods.add(method);
      localRoutes.set(route, methods);
    }

    const appRoute = routeFromAppFile(file.path);
    if (appRoute) {
      const methods = new Set<string>();
      for (const match of file.scanContent.matchAll(
        /\b(?:export\s+(?:async\s+function|const)\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gu,
      )) {
        if (match[1]) methods.add(match[1]);
      }
      localRoutes.set(appRoute, methods.size > 0 ? methods : new Set(["UNKNOWN"]));
    }

    if (localRoutes.size === 0) localRoutes.set("<dynamic-or-mounted>", new Set(["UNKNOWN"]));
    for (const [route, methods] of localRoutes) {
      routes.push({
        path: file.path,
        route,
        methods: [...methods].sort(compareText),
        permissionCodes,
        securitySymbols,
      });
    }
  }
  return routes.sort((left, right) =>
    compareText(left.path, right.path) || compareText(left.route, right.route));
}

function scanKeycloakMappings(files: SourceFile[]): KeycloakMapping[] {
  const mappings: KeycloakMapping[] = [];
  for (const file of files.filter((item) => item.artifactClass === "keycloak")) {
    let root: unknown;
    try {
      root = JSON.parse(file.content);
    } catch {
      continue;
    }
    const visit = (value: unknown, path: Array<string | number>): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, [...path, index]));
        return;
      }
      const record = value as Record<string, unknown>;
      const mapperType = typeof record.protocolMapper === "string"
        ? record.protocolMapper
        : typeof record.identityProviderMapper === "string"
          ? record.identityProviderMapper
          : null;
      if (mapperType) {
        const config = record.config && typeof record.config === "object" && !Array.isArray(record.config)
          ? record.config as Record<string, unknown>
          : {};
        mappings.push({
          path: file.path,
          jsonPath: path.map(String).join("."),
          name: typeof record.name === "string" ? record.name : null,
          mapperType,
          userAttribute: typeof config["user.attribute"] === "string"
            ? config["user.attribute"]
            : null,
          claimName: typeof config["claim.name"] === "string" ? config["claim.name"] : null,
          hardcodedRole: typeof config.role === "string" ? config.role : null,
        });
      }
      for (const [key, child] of Object.entries(record)) visit(child, [...path, key]);
    };
    visit(root, []);
  }
  return mappings.sort((left, right) =>
    compareText(left.path, right.path) || compareText(left.jsonPath, right.jsonPath));
}

function objectDependenciesInBlock(
  block: string,
  objects: AuthorizationRegistryObject[],
): string[] {
  return objects
    .filter((object) => new RegExp(
      `(?<![A-Za-z0-9_])${escapeRegex(object.qualifiedName)}(?![A-Za-z0-9_])`,
      "iu",
    ).test(block))
    .map((object) => object.qualifiedName)
    .sort(compareText);
}

function scanDerivedDatabaseObjects(
  files: SourceFile[],
  objects: AuthorizationRegistryObject[],
): DerivedDatabaseObject[] {
  const registeredNames = new Set(objects.map((object) => object.qualifiedName.toLowerCase()));
  const derived: DerivedDatabaseObject[] = [];
  for (const file of files.filter((item) => [".sql"].includes(extname(item.path).toLowerCase()))) {
    const functionPattern =
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/giu;
    const functionMatches = [...file.scanContent.matchAll(functionPattern)];
    for (let index = 0; index < functionMatches.length; index += 1) {
      const match = functionMatches[index]!;
      const start = match.index ?? 0;
      const end = functionMatches[index + 1]?.index ?? file.scanContent.length;
      const qualifiedName = (match[1] ?? "").toLowerCase();
      const dependencies = objectDependenciesInBlock(
        file.scanContent.slice(start, end),
        objects,
      ).filter((dependency) => dependency.toLowerCase() !== qualifiedName);
      const registered = registeredNames.has(qualifiedName);
      if (!registered && dependencies.length === 0 && !isStrongAuthorizationObjectName(qualifiedName)) {
        continue;
      }
      derived.push({
        qualifiedName,
        kind: "function",
        path: file.path,
        line: lineNumberAt(file.scanContent, start),
        dependencies,
        classification: registered
          ? "registered"
          : dependencies.length > 0 ? "structural_dependency" : "unclassified",
      });
    }

    const triggerPattern =
      /\bCREATE\s+TRIGGER\s+([a-z_][a-z0-9_]*)[\s\S]*?\bON\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)[\s\S]*?\bEXECUTE\s+FUNCTION\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)[\s\S]*?;/giu;
    for (const match of file.scanContent.matchAll(triggerPattern)) {
      const attachedTo = (match[2] ?? "").toLowerCase();
      const attachedObject = objects.find((object) =>
        object.qualifiedName.toLowerCase() === attachedTo);
      const triggerName = match[1] ?? "";
      const qualifiedName = `${attachedTo}.${triggerName}`;
      if (!attachedObject && !isStrongAuthorizationObjectName(qualifiedName)) continue;
      derived.push({
        qualifiedName,
        kind: "trigger",
        path: file.path,
        line: lineNumberAt(file.scanContent, match.index ?? 0),
        attachedTo,
        executes: (match[3] ?? "").toLowerCase(),
        dependencies: attachedObject ? [attachedObject.qualifiedName] : [],
        classification: attachedObject ? "structural_dependency" : "unclassified",
      });
    }

    const viewPattern =
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+AS([\s\S]*?);/giu;
    for (const match of file.scanContent.matchAll(viewPattern)) {
      const qualifiedName = (match[1] ?? "").toLowerCase();
      const dependencies = objectDependenciesInBlock(match[2] ?? "", objects);
      if (dependencies.length === 0 && !isStrongAuthorizationObjectName(qualifiedName)) continue;
      derived.push({
        qualifiedName,
        kind: "view",
        path: file.path,
        line: lineNumberAt(file.scanContent, match.index ?? 0),
        dependencies,
        classification: registeredNames.has(qualifiedName)
          ? "registered"
          : dependencies.length > 0 ? "structural_dependency" : "unclassified",
      });
    }
  }
  return derived.sort((left, right) =>
    compareText(left.qualifiedName, right.qualifiedName)
    || compareText(left.path, right.path)
    || left.line - right.line);
}

function generatedArtifactInventory(
  root: string,
  registry: AuthorizationRegistry,
): GeneratedArtifact[] {
  return registry.generatedArtifacts.map((entry) => {
    const artifactPath = resolve(root, entry.path);
    const generatorPath = entry.generator.trim().split(/\s+/u)[0] ?? "";
    const absoluteGenerator = resolve(root, generatorPath);
    const present = existsSync(artifactPath);
    return {
      ...entry,
      generatorPath,
      present,
      generatorPresent: existsSync(absoluteGenerator),
      sha256: present ? hash(readFileSync(artifactPath, "utf8").replaceAll("\r\n", "\n")) : null,
    };
  }).sort((left, right) => compareText(left.path, right.path));
}

function mergeReferences(...groups: ObjectReference[][]): ObjectReference[] {
  const raw = groups.flatMap((group) =>
    group.flatMap((item) => item.lines.map((line) => ({
      objectId: item.objectId,
      qualifiedName: item.qualifiedName,
      path: item.path,
      artifactClass: item.artifactClass,
      access: item.access,
      line,
    }))));
  return aggregateReferences(raw);
}

export function validateRegistry(registry: AuthorizationRegistry): string[] {
  const failures: string[] = [];
  if (registry.schemaVersion !== 1) failures.push("Registry schemaVersion must be 1.");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const object of registry.objects) {
    if (ids.has(object.id)) failures.push(`Duplicate object id: ${object.id}`);
    if (names.has(object.qualifiedName.toLowerCase())) {
      failures.push(`Duplicate qualified object name: ${object.qualifiedName}`);
    }
    ids.add(object.id);
    names.add(object.qualifiedName.toLowerCase());
    if (!object.owner.trim()) failures.push(`Object has no owner: ${object.id}`);
    if (!object.disposition.trim()) failures.push(`Object has no disposition: ${object.id}`);
    if (object.planes.length === 0) failures.push(`Object has no plane: ${object.id}`);
    if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/u.test(object.qualifiedName)) {
      failures.push(`Object is not an exact qualified SQL identity: ${object.qualifiedName}`);
    }
  }
  return failures.sort(compareText);
}

export function buildAuthorizationInventory(
  root = resolve(fileURLToPath(new URL("../..", import.meta.url))),
): AuthorizationInventory {
  const registryPath = resolve(root, AUTHORIZATION_REGISTRY_PATH);
  const registryText = readFileSync(registryPath, "utf8").replaceAll("\r\n", "\n");
  const registry = JSON.parse(registryText) as AuthorizationRegistry;
  const registryFailures = validateRegistry(registry);
  if (registryFailures.length > 0) {
    throw new Error(`Invalid authorization source registry:\n${registryFailures.join("\n")}`);
  }

  const files = discoverFiles(root, registry);
  const staticScan = scanObjectReferences(files, registry.objects);
  const prismaReferences = scanPrismaReferences(files, registry.objects);
  const references = mergeReferences(staticScan.references, prismaReferences);
  const securitySymbols = scanSecuritySymbols(files, registry.securitySymbols);
  const contractFields = aggregateExactFieldReferences(files, registry.contractFields);
  const permissionDefinitions = scanPermissionDefinitions(files);
  const permissionScan = scanPermissionUses(files, permissionDefinitions);
  const routes = scanRoutes(files, permissionScan.uses, securitySymbols);
  const keycloakMappings = scanKeycloakMappings(files);
  const derivedDatabaseObjects = scanDerivedDatabaseObjects(files, registry.objects);
  const generatedArtifacts = generatedArtifactInventory(root, registry);

  const objects = registry.objects.map((object) => {
    const objectReferences = references.filter((reference) => reference.objectId === object.id);
    return {
      ...object,
      definitionCount: objectReferences.filter((reference) => reference.access === "define").length,
      readerCount: objectReferences.filter((reference) =>
        reference.access === "read" || reference.access === "reference").length,
      writerCount: objectReferences.filter((reference) => WRITER_ACCESS.has(reference.access)).length,
      executionCount: objectReferences.filter((reference) =>
        reference.access === "execute").length,
      files: uniqueSorted(objectReferences.map((reference) => reference.path)),
    };
  }).sort((left, right) => compareText(left.id, right.id));

  const unknownObjectSources = staticScan.unknownObjectReferences.map((reference) => ({
    type: "object" as const,
    qualifiedName: reference.qualifiedName,
    path: reference.path,
    access: reference.access,
    lines: reference.lines,
  }));
  const unknownSymbolSources = securitySymbols
    .filter((reference) =>
      reference.classification === "unclassified"
      && reference.artifactClass !== "test")
    .map((reference) => ({
      type: "security_symbol" as const,
      symbol: reference.symbol,
      path: reference.path,
      lines: reference.lines,
    }));
  const unknownDerivedSources = derivedDatabaseObjects
    .filter((item) =>
      item.classification === "unclassified"
      || (item.kind !== "trigger" && item.classification !== "registered"))
    .map((item) => ({
      type: "database_object" as const,
      qualifiedName: item.qualifiedName,
      path: item.path,
      line: item.line,
    }));
  const unknownPermissionSources = permissionScan.unknownUses
    .filter((item) => item.artifactClass !== "test")
    .map((item) => ({
      type: "permission_code" as const,
      code: item.code,
      path: item.path,
      lines: item.lines,
    }));

  const unownedObjects = objects
    .filter((object) => !object.owner.trim() || !object.disposition.trim())
    .map((object) => object.id);
  const unclassifiedWriters = references.filter((reference) =>
    WRITER_ACCESS.has(reference.access)
    && (
      reference.artifactClass === "generated"
      || !registry.objects.find((object) => object.id === reference.objectId)?.owner
    ));
  const missingDefinitions = objects
    .filter((object) => object.sourceOfTruth && object.definitionCount === 0)
    .map((object) => object.id);
  const generatedArtifactFailures = generatedArtifacts.flatMap((artifact) => {
    const failures: string[] = [];
    if (!artifact.present) failures.push(`${artifact.path}: artifact missing`);
    if (!artifact.generatorPresent) {
      failures.push(`${artifact.path}: generator missing (${artifact.generatorPath})`);
    }
    return failures;
  });
  const authorizationPaths = new Set<string>([
    ...references.map((reference) => reference.path),
    ...staticScan.unknownObjectReferences.map((reference) => reference.path),
    ...securitySymbols.map((reference) => reference.path),
    ...contractFields.map((reference) => reference.path),
    ...permissionDefinitions.flatMap((definition) =>
      definition.sources.map((source) => source.path)),
    ...permissionScan.uses.map((use) => use.path),
    ...permissionScan.unknownUses.map((use) => use.path),
    ...routes.map((route) => route.path),
    ...keycloakMappings.map((mapping) => mapping.path),
    ...derivedDatabaseObjects.map((object) => object.path),
    ...generatedArtifacts.map((artifact) => artifact.path),
  ]);
  const authorizationFiles = files.filter((file) => authorizationPaths.has(file.path));

  const inventory: AuthorizationInventory = {
    schemaVersion: 1,
    contract: {
      registry: AUTHORIZATION_REGISTRY_PATH,
      registrySha256: hash(registryText),
      deterministic: true,
      scanRoots: [...registry.contract.scanRoots],
      excludedDirectories: [...registry.contract.excludedDirectories],
      excludedFiles: [...registry.contract.excludedFiles],
    },
    summary: {
      filesScanned: files.length,
      authorizationFiles: authorizationFiles.length,
      registeredObjects: objects.length,
      objectReferences: references.length,
      writerReferences: references.filter((reference) => WRITER_ACCESS.has(reference.access)).length,
      securitySymbolReferences: securitySymbols.length,
      contractFieldReferences: contractFields.length,
      permissionDefinitions: permissionDefinitions.length,
      permissionUses: permissionScan.uses.length,
      routes: routes.length,
      keycloakMappings: keycloakMappings.length,
      derivedDatabaseObjects: derivedDatabaseObjects.length,
      generatedArtifacts: generatedArtifacts.length,
    },
    objects,
    files: authorizationFiles.map((file) => ({
      path: file.path,
      artifactClass: file.artifactClass,
      sha256: file.sha256,
    })),
    references,
    securitySymbols,
    contractFields,
    permissionDefinitions,
    permissionUses: permissionScan.uses,
    routes,
    keycloakMappings,
    derivedDatabaseObjects,
    generatedArtifacts,
    gates: {
      unknownSources: [
        ...unknownObjectSources,
        ...unknownSymbolSources,
        ...unknownDerivedSources,
        ...unknownPermissionSources,
      ].sort((left, right) =>
        compareText(left.type, right.type)
        || compareText(
          "path" in left ? left.path : "",
          "path" in right ? right.path : "",
        )),
      unknownWriters: staticScan.unknownObjectReferences
        .filter((reference) => WRITER_ACCESS.has(reference.access)),
      unownedObjects: unownedObjects.sort(compareText),
      unclassifiedWriters,
      missingDefinitions: missingDefinitions.sort(compareText),
      generatedArtifactFailures: generatedArtifactFailures.sort(compareText),
    },
  };
  return inventory;
}

export function serializeAuthorizationInventory(inventory: AuthorizationInventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function gateCount(inventory: AuthorizationInventory): number {
  return Object.values(inventory.gates).reduce((total, entries) => total + entries.length, 0);
}

export function renderAuthorizationInventoryMarkdown(
  inventory: AuthorizationInventory,
): string {
  const openGateCount = gateCount(inventory);
  const lines = [
    "# Wave 0 authorization source inventory",
    "",
    "> Generated deterministically by `scripts/policy/authorization-inventory.ts` from the reviewed exact-object registry. Edit the registry or scanner, then regenerate; do not hand-edit this report.",
    "",
    `Registry SHA-256: \`${inventory.contract.registrySha256}\``,
    `Files scanned: ${inventory.summary.filesScanned}`,
    `Registered authorization objects: ${inventory.summary.registeredObjects}`,
    `Aggregated object references: ${inventory.summary.objectReferences}`,
    `Writer references: ${inventory.summary.writerReferences}`,
    `Permission definitions / uses: ${inventory.summary.permissionDefinitions} / ${inventory.summary.permissionUses}`,
    `Authorization-bearing routes: ${inventory.summary.routes}`,
    `Keycloak mappers: ${inventory.summary.keycloakMappings}`,
    `Open gate findings: ${openGateCount}`,
    "",
    "## Gate status",
    "",
    "| Gate | Findings |",
    "|---|---:|",
    `| Unknown authorization sources | ${inventory.gates.unknownSources.length} |`,
    `| Unknown authorization writers | ${inventory.gates.unknownWriters.length} |`,
    `| Unowned objects | ${inventory.gates.unownedObjects.length} |`,
    `| Unclassified writers | ${inventory.gates.unclassifiedWriters.length} |`,
    `| Missing source definitions | ${inventory.gates.missingDefinitions.length} |`,
    `| Generated artifact failures | ${inventory.gates.generatedArtifactFailures.length} |`,
    "",
    "A non-zero finding is deliberately visible and blocks the Wave 0 completeness gate. Tests and documentation do not satisfy runtime ownership.",
    "",
    "## Registered authorities",
    "",
    "| ID | Exact object | Database | Class | Owner | Planes | Disposition | Definitions | Readers | Writers |",
    "|---|---|---|---|---|---|---|---:|---:|---:|",
    ...inventory.objects.map((object) =>
      `| ${markdownCell(object.id)} | \`${markdownCell(object.qualifiedName)}\` | ${markdownCell(object.database)} | ${markdownCell(object.authorityClass)} | ${markdownCell(object.owner)} | ${markdownCell(object.planes.join(", "))} | ${markdownCell(object.disposition)} | ${object.definitionCount} | ${object.readerCount} | ${object.writerCount} |`),
    "",
    "## Unknown source findings",
    "",
  ];

  if (inventory.gates.unknownSources.length === 0) {
    lines.push("None.");
  } else {
    lines.push("| Type | Identity | Path | Lines |", "|---|---|---|---|");
    for (const finding of inventory.gates.unknownSources) {
      const identity = "qualifiedName" in finding
        ? finding.qualifiedName
        : "symbol" in finding ? finding.symbol : finding.code;
      const findingLines = "lines" in finding ? finding.lines.join(", ") : String(finding.line);
      lines.push(
        `| ${finding.type} | \`${markdownCell(identity)}\` | ${markdownCell(finding.path)} | ${findingLines} |`,
      );
    }
  }

  lines.push(
    "",
    "## Writer inventory",
    "",
    "| Object | Access | Artifact class | Path | Lines |",
    "|---|---|---|---|---|",
    ...inventory.references
      .filter((reference) => WRITER_ACCESS.has(reference.access))
      .map((reference) =>
        `| \`${markdownCell(reference.qualifiedName)}\` | ${reference.access} | ${reference.artifactClass} | ${markdownCell(reference.path)} | ${reference.lines.join(", ")} |`),
    "",
    "## Authorization-bearing routes",
    "",
    "| Source | Route | Methods | Permissions | Security symbols |",
    "|---|---|---|---|---|",
    ...inventory.routes.map((route) =>
      `| ${markdownCell(route.path)} | \`${markdownCell(route.route)}\` | ${route.methods.join(", ")} | ${route.permissionCodes.map((code) => `\`${markdownCell(code)}\``).join("<br>") || "—"} | ${route.securitySymbols.map(markdownCell).join("<br>") || "—"} |`),
    "",
    "## Keycloak mapper inventory",
    "",
    "| Source | JSON path | Name | Mapper | User attribute | Claim | Hardcoded role |",
    "|---|---|---|---|---|---|---|",
    ...inventory.keycloakMappings.map((mapping) =>
      `| ${markdownCell(mapping.path)} | ${markdownCell(mapping.jsonPath)} | ${markdownCell(mapping.name ?? "—")} | ${markdownCell(mapping.mapperType)} | ${markdownCell(mapping.userAttribute ?? "—")} | ${markdownCell(mapping.claimName ?? "—")} | ${markdownCell(mapping.hardcodedRole ?? "—")} |`),
    "",
    "## Classification contract",
    "",
    "- SQL and Kysely access is classified as define, read, reference, insert, update, delete, truncate, execute, or generated mirror.",
    "- Authorization-object discovery uses exact qualified identities. Bare words such as `role`, `group`, and `policy` are not discovery signals; `master.pay_group`, `control.tax_group`, and posting-role accounting tables are therefore not IAM authorities.",
    "- A structurally strong unregistered authorization object, an unreviewed runtime security symbol, or an unknown permission code in a permission-check context is emitted as an open gate.",
    "- Dynamic SQL must be represented by an exact reviewed source entry; it is not silently allowlisted.",
    "- Generated files are projections and must name an existing generator.",
  );

  return `${lines.join("\n")}\n`;
}

export function writeAuthorizationInventory(
  root = resolve(fileURLToPath(new URL("../..", import.meta.url))),
): AuthorizationInventory {
  const inventory = buildAuthorizationInventory(root);
  const machinePath = resolve(root, AUTHORIZATION_INVENTORY_PATH);
  const summaryPath = resolve(root, AUTHORIZATION_SUMMARY_PATH);
  mkdirSync(dirname(machinePath), { recursive: true });
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(machinePath, serializeAuthorizationInventory(inventory), "utf8");
  writeFileSync(summaryPath, renderAuthorizationInventoryMarkdown(inventory), "utf8");
  return inventory;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === resolve(fileURLToPath(import.meta.url))) {
  const inventory = writeAuthorizationInventory();
  process.stdout.write(
    `authorization-inventory: wrote ${inventory.summary.registeredObjects} objects, `
    + `${inventory.summary.objectReferences} references, ${gateCount(inventory)} open gate finding(s).\n`,
  );
}
