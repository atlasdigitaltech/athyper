import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export function inventory(
  root = fileURLToPath(new URL("../", import.meta.url)),
) {
  const images = new Map();
  const excluded = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^compose.*\.ya?ml$/.test(entry.name)) {
        for (const match of readFileSync(path, "utf8").matchAll(
          /^\s*image:\s*([^\r\n#]+)/gm,
        )) {
          const declared = match[1].trim().replace(/^["']|["']$/g, "");
          const image =
            declared.match(/^\$\{[A-Z0-9_]+:-([^{}]+)\}$/)?.[1] ?? declared;
          if (!/^[a-zA-Z0-9._/:+-]+@sha256:[a-f0-9]{64}$/.test(image)) {
            excluded.push({
              file: relative(root, path),
              image,
              reason:
                "Not a literal digest; resolve or scan the built image separately",
            });
            continue;
          }
          const item = images.get(image) ?? {
            id: createHash("sha256").update(image).digest("hex").slice(0, 16),
            image,
            files: [],
          };
          item.files.push(relative(root, path));
          images.set(image, item);
        }
      }
    }
  }
  walk(root);
  return {
    include: [...images.values()].sort((a, b) =>
      a.image.localeCompare(b.image),
    ),
    excluded,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = inventory();
  console.log(
    JSON.stringify(
      process.argv.includes("--matrix") ? { include: result.include } : result,
    ),
  );
}
