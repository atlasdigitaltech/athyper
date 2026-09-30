/** Read-only prerequisite check. Never remap IDs inside a signed descriptor. */
export function unresolvedRecoveryPermissions(bindings, catalog) {
  if (!Array.isArray(bindings)) throw Error('RECOVERY_OPERATION_BINDINGS_REQUIRED');
  return [...new Map(bindings.filter(binding => !catalog.some(permission =>
    permission.id === binding.permissionId && permission.code === binding.permissionCode &&
    permission.kind === (binding.permissionKind ?? 'entity_operation') &&
    permission.scopeKinds.includes(binding.scopeKind)
  )).map(binding => [binding.permissionId + ':' + binding.scopeKind, {
    permissionId: binding.permissionId, permissionCode: binding.permissionCode,
    permissionKind: binding.permissionKind ?? 'entity_operation', scopeKind: binding.scopeKind,
  }])).values()];
}
