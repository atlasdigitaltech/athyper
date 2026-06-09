/**
 * SecretResolver — resolves AI provider credentials by name.
 *
 * Phase 7a reads from environment variables.  The interface is vault-ready:
 * replace the env-var body with a Vault/AWS Secrets Manager call and the
 * rest of the AI runtime requires zero changes.
 *
 * Raw API keys are NEVER stored in metadata columns or logged.
 * Only the secret_ref string is passed around; the resolved key lives only
 * in memory for the duration of the invocation.
 */

export class SecretResolver {
  // Resolves a named secret reference to its value.
  // secret_ref naming convention: <PROVIDER>_API_KEY  (e.g. ANTHROPIC_API_KEY)
  resolve(secretRef: string): string {
    const value = process.env[secretRef];
    if (!value) {
      throw new Error(
        `SecretResolver: secret "${secretRef}" not found in environment. ` +
        `Configure the environment variable or wire a vault backend.`,
      );
    }
    return value;
  }

  // Returns true when the secret is present (for health checks) without
  // exposing the value.
  has(secretRef: string): boolean {
    return Boolean(process.env[secretRef]);
  }
}
