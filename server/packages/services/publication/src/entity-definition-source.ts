/**
 * Generic active-definition retrieval boundary. Publication/runtime adapters own
 * retrieval, pinning and caching; domain consumers only interpret their projection.
 */
export interface EntityDefinitionSource<Projection> {
  findActive(publicationKey: string): Promise<Projection | null>;
}
