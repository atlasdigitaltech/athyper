import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const files = [
  "packages/shared/runtime-domain/collaboration-ui/src/comments/comment-reactions.tsx",
  "packages/shared/ui-platform/collaboration-ui/src/comments/comment-reactions.tsx",
];

for (const relative of files) {
  const path = resolve(relative);
  const before = await readFile(path, "utf8");
  let after = before
    .replace(/\/\/ Canonical picker list[^\r\n]*\r?\nconst REACTIONS = \[[\s\S]*?\] as const;\r?\n\r?\n/, "")
    .replace(
      'import { useReactions } from "../hooks/collab";',
      'import { useReactionTypes, useReactions } from "../hooks/collab";',
    )
    .replace(
      'import { useReactions, type ReactionSummary } from "../hooks/collab";',
      'import { useReactionTypes, useReactions, type ReactionSummary } from "../hooks/collab";',
    )
    .replace(
      /  const \{ reactions, toggleReaction \} = useReactions\(([^\n]+)\);\r?\n/,
      (line, args) =>
        `  const { reactions, toggleReaction } = useReactions(${args});\n`
        + "  const { reactionTypes } = useReactionTypes();\n",
    )
    .replace("REACTIONS.map(({ code, emoji })", "reactionTypes.map(({ code, emoji, name })")
    .replace('title={code.replace(/_/g, " ")}', "title={name}");
  if (after === before) throw new Error(`No reaction-picker change for ${relative}`);
  await writeFile(path, after);
}
console.log("Reaction pickers now use the document.reaction_type lookup domain.");
