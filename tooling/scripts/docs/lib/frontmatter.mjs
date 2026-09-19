const DELIM = "---";

/**
 * Minimal frontmatter parser for the flat key: value schema this pipeline
 * uses (title, audience, reviewed_by, reviewed_date). Not a general YAML
 * parser — values are treated as strings, optionally quoted.
 */
export function parseFrontmatter(source) {
  if (!source.startsWith(DELIM)) {
    return { data: {}, body: source };
  }
  const end = source.indexOf(`\n${DELIM}`, DELIM.length);
  if (end === -1) {
    return { data: {}, body: source };
  }
  const block = source.slice(DELIM.length, end).trim();
  const bodyStart = source.indexOf("\n", end + DELIM.length + 1);
  const body = bodyStart === -1 ? "" : source.slice(bodyStart + 1);

  const data = {};
  for (const line of block.split("\n")) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    data[key] = unquote(rawValue.trim());
  }
  return { data, body };
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function stringifyFrontmatter(data) {
  const lines = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${formatValue(value)}`);
  return `${DELIM}\n${lines.join("\n")}\n${DELIM}\n`;
}

function formatValue(value) {
  const str = String(value);
  return /[:#]/.test(str) || str !== str.trim() ? JSON.stringify(str) : str;
}

/** First `# Heading` in a markdown body, used as a title fallback. */
export function firstHeading(body) {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : undefined;
}
