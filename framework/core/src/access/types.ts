/**
 * Access Control Types
 */

export type AccessContext = {
  userId: string;
  tenantId: string;
  roles: string[];
};

export interface AccessPolicy {
  can(
    action: string,
    resource: string,
    ctx: AccessContext
  ): boolean | Promise<boolean>;
}
