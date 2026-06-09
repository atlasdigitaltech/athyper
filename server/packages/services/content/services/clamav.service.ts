/**
 * ClamAV Scanner — TCP INSTREAM virus scanning
 *
 * Implements the clamd INSTREAM protocol over a direct TCP socket connection.
 * No external npm dependencies — uses Node.js built-in `node:net`.
 *
 * Protocol (INSTREAM):
 *   1. Connect to clamd on the configured host:port.
 *   2. Send "nINSTREAM\n" (newline-terminated command; "n" = newline mode).
 *   3. Send file data as one or more chunks:
 *        [ 4-byte big-endian length ][ chunk bytes ]
 *   4. Send end-of-stream: 4 zero bytes (length = 0).
 *   5. Read response until newline:
 *        "stream: OK"             — file is clean
 *        "stream: <THREAT> FOUND" — threat detected, THREAT is the signature name
 *
 * Fail-open vs fail-closed:
 *   onUnavailable: "fail-closed" (default) — re-throws the connection error, causing
 *     the upload handler to return 503. Prevents silent bypass of virus scanning when
 *     clamd is unreachable.
 *   onUnavailable: "fail-open" — connection errors log a warning and treat the file
 *     as clean. Only for local development; the server config preflight rejects this
 *     setting in staging/production.
 */

import * as net from "node:net";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanResult {
  /** true = no threat found; false = threat detected */
  clean:    boolean;
  /** Signature name when clean = false, e.g. "Eicar-Test-Signature" */
  threat?:  string;
  /** true when clamd was unreachable and onUnavailable = "fail-open" */
  skipped?: boolean;
}

export interface ClamavScannerOptions {
  host:          string;
  port:          number;
  /** TCP connection + response timeout in ms. Default: 10 000. */
  timeoutMs?:    number;
  /**
   * Behaviour when clamd is unreachable or returns an unexpected error:
   *   "fail-closed" (default) — re-throws, causing the caller to return 503
   *   "fail-open"               — returns { clean: true, skipped: true }
   */
  onUnavailable?: "fail-open" | "fail-closed";
}

// ── ClamAV chunk size cap ────────────────────────────────────────────────────
// clamd INSTREAM docs permit up to 2^32−1 bytes per chunk.
// We cap at 10 MiB to avoid allocating a single oversized write buffer.

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MiB

// ── Scanner ───────────────────────────────────────────────────────────────────

export class ClamavScanner {
  private readonly host:          string;
  private readonly port:          number;
  private readonly timeoutMs:     number;
  private readonly onUnavailable: "fail-open" | "fail-closed";

  constructor(opts: ClamavScannerOptions) {
    this.host          = opts.host;
    this.port          = opts.port;
    this.timeoutMs     = opts.timeoutMs ?? 10_000;
    this.onUnavailable = opts.onUnavailable ?? "fail-closed";
  }

  /**
   * Scan a file buffer via clamd INSTREAM.
   * Returns a ScanResult — never throws under fail-open mode.
   */
  async scan(buffer: Buffer): Promise<ScanResult> {
    return this._scanInternal(buffer).catch((err: unknown) => {
      if (this.onUnavailable === "fail-closed") throw err;
      // fail-open: treat as clean, mark as skipped so callers can log/alert
      return { clean: true, skipped: true } satisfies ScanResult;
    });
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _scanInternal(buffer: Buffer): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve, reject) => {
      const socket   = new net.Socket();
      let   response = "";
      let   settled  = false;

      const finish = (result: ScanResult | Error): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (result instanceof Error) reject(result); else resolve(result);
      };

      socket.setTimeout(this.timeoutMs);
      socket.on("timeout", () => finish(new Error(`ClamAV scan timed out after ${this.timeoutMs} ms`)));
      socket.on("error",   (err: Error) => finish(err));

      socket.connect(this.port, this.host, () => {
        // nINSTREAM\n — newline-delimited command prefix
        socket.write("nINSTREAM\n");

        // Stream file buffer in CHUNK_SIZE chunks, each prefixed by 4-byte BE length
        let offset = 0;
        while (offset < buffer.length) {
          const end   = Math.min(offset + CHUNK_SIZE, buffer.length);
          const chunk = buffer.subarray(offset, end);
          const len   = Buffer.allocUnsafe(4);
          len.writeUInt32BE(chunk.length, 0);
          socket.write(len);
          socket.write(chunk);
          offset = end;
        }

        // End-of-stream: 4 zero bytes
        socket.write(Buffer.alloc(4));
      });

      socket.on("data", (chunk: Buffer) => {
        response += chunk.toString("utf8");
        // clamd sends a newline-terminated line — parse once we have one
        if (!response.includes("\n")) return;
        const line = response.split("\n")[0]!.trim();
        finish(parseScanResponse(line));
      });

      socket.on("close", () => {
        if (settled) return;
        // Connection closed without a newline — try to parse whatever came back
        if (response.trim()) {
          finish(parseScanResponse(response.trim()));
        } else {
          finish(new Error("ClamAV closed the connection without a response"));
        }
      });
    });
  }
}

// ── Response parser ───────────────────────────────────────────────────────────

/**
 * Parse a clamd INSTREAM response line.
 * Expected forms:
 *   "stream: OK"
 *   "stream: Eicar-Test-Signature FOUND"
 *   "stream: <error message> ERROR"
 */
function parseScanResponse(line: string): ScanResult {
  if (line.endsWith(" OK")) {
    return { clean: true };
  }
  const foundMatch = line.match(/^.*?:\s*(.+?)\s+FOUND$/);
  if (foundMatch) {
    return { clean: false, threat: foundMatch[1] };
  }
  // ERROR or unexpected response — treat as infrastructure failure
  throw new Error(`ClamAV unexpected response: ${line}`);
}
