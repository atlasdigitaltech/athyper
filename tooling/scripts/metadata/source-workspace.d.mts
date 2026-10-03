export interface EntitySource {
  entityCode: string;
  directory: string;
  descriptorPath: string;
  descriptor: { schema: string; entityCode: string; definition?: string; artifacts?: string[]; placement?: string; localization?: string; capabilities?: string; activity?: string; release?: string };
}
export interface SourceDocument { ref: string; path: string; value: Record<string, any>; }
export interface SourceWorkspace {
  metadataRoot: string;
  manifest: Record<string, any>;
  entitiesRoot: string;
  profilesRoot: string;
  reviewRoot: string;
  schemasRoot: string;
  entities: Map<string, EntitySource>;
  documents: SourceDocument[];
  resolveRef(ref: string): string;
  resolveProfile(selection: { code: string; version: number }): string;
}
export function discoverWorkspace(metadataRoot?: string): SourceWorkspace;
export function resolveSourcePath<T>(input: T): T;
