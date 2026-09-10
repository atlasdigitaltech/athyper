/** Process-local candidate cache. Never stores answers, passages or authorization decisions. */
export class AtlasBoundedCache<T> {
  private readonly entries = new Map<
    string,
    { json: string; bytes: number; expires: number }
  >();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  constructor(
    private readonly options: {
      maxEntries: number;
      maxBytes: number;
      ttlMs: number;
      now?: () => number;
    },
  ) {
    if (
      ![options.maxEntries, options.maxBytes, options.ttlMs].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      )
    )
      throw new TypeError("Positive finite cache bounds required.");
  }
  private now() {
    return (this.options.now ?? Date.now)();
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.bytes -= entry.bytes;
      this.entries.delete(key);
    }
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= this.now()) {
      this.remove(key);
      this.misses++;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits++;
    return JSON.parse(entry.json) as T;
  }
  set(key: string, value: T): void {
    const json = JSON.stringify(value);
    if (json === undefined) return;
    const bytes = Buffer.byteLength(key) + Buffer.byteLength(json);
    this.remove(key);
    if (bytes > this.options.maxBytes) return;
    const now = this.now();
    for (const [id, entry] of this.entries)
      if (entry.expires <= now) this.remove(id);
    while (
      this.entries.size >= this.options.maxEntries ||
      this.bytes + bytes > this.options.maxBytes
    ) {
      this.remove(this.entries.keys().next().value!);
      this.evictions++;
    }
    this.entries.set(key, { json, bytes, expires: now + this.options.ttlMs });
    this.bytes += bytes;
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
  stats() {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}
