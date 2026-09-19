import { pathToFileURL } from "node:url";

export function isMain(moduleUrl: string, entrypoint = process.argv[1]): boolean {
  return Boolean(entrypoint) && moduleUrl === pathToFileURL(entrypoint!).href;
}
