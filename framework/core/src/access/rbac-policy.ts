import type { AccessContext, AccessPolicy } from "./types.js";

/**
 * Role-based access control policy with real implementation
 */
export class RbacPolicy implements AccessPolicy {
  private rules = new Map<string, Set<string>>();

  constructor(rules?: Record<string, string[]>) {
    if (rules) {
      for (const [role, actions] of Object.entries(rules)) {
        this.rules.set(role, new Set(actions));
      }
    } else {
      // Default rules
      this.initializeDefaultRules();
    }
  }

  private initializeDefaultRules(): void {
    // Admin has all permissions
    this.rules.set("admin", new Set(["*"]));

    // Manager has most permissions
    this.rules.set("manager", new Set([
      "read:*",
      "create:*",
      "update:*",
      "delete:document",
      "delete:task",
    ]));

    // User has basic permissions
    this.rules.set("user", new Set([
      "read:*",
      "create:document",
      "create:task",
      "update:own",
    ]));

    // Guest has read-only
    this.rules.set("guest", new Set(["read:*"]));
  }

  can(action: string, resource: string, ctx: AccessContext): boolean {
    // Check each role the user has
    for (const role of ctx.roles) {
      const permissions = this.rules.get(role);
      if (!permissions) continue;

      // Check for wildcard permission
      if (permissions.has("*")) return true;

      // Check for exact match
      const fullPermission = `${action}:${resource}`;
      if (permissions.has(fullPermission)) return true;

      // Check for action wildcard (e.g., "read:*")
      const actionWildcard = `${action}:*`;
      if (permissions.has(actionWildcard)) return true;

      // Check for resource wildcard (e.g., "*:document")
      const resourceWildcard = `*:${resource}`;
      if (permissions.has(resourceWildcard)) return true;
    }

    return false;
  }

  /**
   * Add a rule for a role
   */
  addRule(role: string, permission: string): void {
    if (!this.rules.has(role)) {
      this.rules.set(role, new Set());
    }
    this.rules.get(role)!.add(permission);
  }

  /**
   * Remove a rule for a role
   */
  removeRule(role: string, permission: string): void {
    this.rules.get(role)?.delete(permission);
  }

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: string): string[] {
    return Array.from(this.rules.get(role) ?? []);
  }

  /**
   * Get all roles
   */
  getAllRoles(): string[] {
    return Array.from(this.rules.keys());
  }
}
