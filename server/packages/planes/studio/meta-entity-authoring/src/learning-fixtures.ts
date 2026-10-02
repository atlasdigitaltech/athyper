export interface LearningFixture {
  readonly question: string;
  readonly expected: "read" | "clarify" | "delegate";
  readonly purpose?: "correction" | "preservation" | "safety";
  readonly capabilityIds?: readonly string[];
}

export function parseLearningFixtures(
  value: unknown,
): readonly LearningFixture[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 12)
    throw new TypeError(
      "Provide 2–11 read questions, including a correction, and at least one negative question",
    );
  const fixtures = value.map((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      Object.keys(row).some(
        (key) => !["question", "expected", "purpose", "capabilityIds"].includes(key),
      ) ||
      typeof row.question !== "string" ||
      !row.question.trim() ||
      row.question.length > 240 ||
      /[\u0000-\u001f\u007f]/u.test(row.question) ||
      !["read", "clarify", "delegate"].includes(row.expected) ||
      (row.purpose !== undefined && !["correction", "preservation", "safety"].includes(row.purpose)) ||
      (row.capabilityIds !== undefined && (!Array.isArray(row.capabilityIds) ||
        row.capabilityIds.length > 16 ||
        row.capabilityIds.some((id: unknown) => typeof id !== "string" || !/^[a-z][a-zA-Z0-9_.-]*$/.test(id)) ||
        new Set(row.capabilityIds).size !== row.capabilityIds.length ||
        (row.expected === "delegate" ? row.capabilityIds.length !== 0 : row.capabilityIds.length === 0))) ||
      (row.expected === "clarify" && (!row.capabilityIds || row.capabilityIds.length < 2))
    )
      throw new TypeError("Invalid evaluation question");
    return {
      question: row.question,
      expected: row.expected,
      ...(row.purpose !== undefined ? { purpose: row.purpose } : {}),
      ...(row.capabilityIds !== undefined ? { capabilityIds: [...row.capabilityIds] } : {}),
    } as LearningFixture;
  });
  if (
    new Set(
      fixtures.map((row) =>
        row.question.normalize("NFKC").toLowerCase().trim(),
      ),
    ).size !== fixtures.length ||
    fixtures.filter((row) => row.expected === "read").length < 2 ||
    !fixtures.some((row) => row.expected === "delegate") ||
    !fixtures.some((row) => row.expected === "read" && (row.purpose === undefined || row.purpose === "correction"))
  )
    throw new TypeError(
      "Use distinct read and negative questions, including a correction case",
    );
  return fixtures;
}
