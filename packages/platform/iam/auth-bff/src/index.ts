export interface PkceTransaction { readonly state: string; readonly nonce: string; readonly verifier: string; readonly challenge: string; readonly returnTo: string; readonly createdAt: number; }
export async function createPkceTransaction(input: { readonly randomBytes: (length: number) => Uint8Array; readonly sha256: (value: string) => Promise<Uint8Array>; readonly returnTo: string; readonly now?: number }): Promise<PkceTransaction> {
  const verifier = base64url(input.randomBytes(32));
  const challenge = base64url(await input.sha256(verifier));
  return Object.freeze({ state: base64url(input.randomBytes(24)), nonce: base64url(input.randomBytes(24)), verifier, challenge, returnTo: safeReturnTo(input.returnTo), createdAt: input.now ?? Date.now() });
}
export function validatePkceCallback(transaction: PkceTransaction, input: { readonly state: string; readonly now: number; readonly maxAgeMs?: number }): void {
  if (transaction.state !== input.state) throw new Error("OAuth state mismatch");
  if (input.now - transaction.createdAt > (input.maxAgeMs ?? 600_000) || transaction.createdAt > input.now) throw new Error("OAuth transaction expired");
}
function base64url(value: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index]!; const second = value[index + 1]; const third = value[index + 2];
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) output += alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) output += alphabet[third & 63];
  }
  return output;
}
function safeReturnTo(value: string): string { return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/"; }
