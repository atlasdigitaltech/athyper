declare module "busboy" {
  import type { IncomingHttpHeaders } from "node:http";
  import type { Readable, Writable } from "node:stream";

  interface BusboyConfig {
    headers: IncomingHttpHeaders;
    limits?: {
      files?: number;
      fileSize?: number;
    };
  }

  interface BusboyFileInfo {
    filename: string;
    encoding: string;
    mimeType: string;
  }

  interface BusboyFieldInfo {
    nameTruncated: boolean;
    valueTruncated: boolean;
    encoding: string;
    mimeType: string;
  }

  interface BusboyParser extends Writable {
    on(event: "file", listener: (fieldName: string, fileStream: Readable, info: BusboyFileInfo) => void): this;
    on(event: "field", listener: (fieldName: string, value: string, info: BusboyFieldInfo) => void): this;
    on(event: "finish", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  export default function busboy(config: BusboyConfig): BusboyParser;
}
