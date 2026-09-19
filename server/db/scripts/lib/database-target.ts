const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function assertLoopbackDatabaseTarget(connectionString: string, expectedDatabase: string): URL {
  const url = new URL(connectionString);
  if (!LOOPBACK_HOSTS.has(url.hostname) || url.pathname !== `/${expectedDatabase}`) {
    throw new Error(`operation accepts only loopback ${expectedDatabase}`);
  }
  return url;
}

export function isLocalDatabaseHost(hostname: string): boolean {
  if (LOOPBACK_HOSTS.has(hostname)) return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split(".").map(Number);
  return octets.length === 4
    && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && (octets[0] === 10
      || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)
      || (octets[0] === 192 && octets[1] === 168));
}
