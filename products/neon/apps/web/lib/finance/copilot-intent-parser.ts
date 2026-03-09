// lib/finance/copilot-intent-parser.ts
//
// Phase 12A: Deterministic Natural Language Intent Parser for Close Copilot.
// Maps freeform text → CopilotQuestionType + context hints.
// No LLM — keyword/pattern matching with scored rules.

import type { CopilotParsedIntent, CopilotQuestionType } from "./types";

// ---------------------------------------------------------------------------
// Entity alias map — maps common names/abbreviations to entity codes
// ---------------------------------------------------------------------------

const ENTITY_ALIASES: Record<string, string> = {
  // Southeast Asia
  malaysia: "MY",
  my: "MY",
  singapore: "SG",
  sg: "SG",
  indonesia: "ID",
  id: "ID",
  thailand: "TH",
  th: "TH",
  philippines: "PH",
  ph: "PH",
  vietnam: "VN",
  vn: "VN",
  // East Asia
  japan: "JP",
  jp: "JP",
  korea: "KR",
  kr: "KR",
  china: "CN",
  cn: "CN",
  taiwan: "TW",
  tw: "TW",
  "hong kong": "HK",
  hk: "HK",
  // South Asia
  india: "IN",
  in: "IN",
  // Oceania
  australia: "AU",
  au: "AU",
  "new zealand": "NZ",
  nz: "NZ",
  // Europe
  uk: "UK",
  "united kingdom": "UK",
  germany: "DE",
  de: "DE",
  france: "FR",
  fr: "FR",
  // Americas
  us: "US",
  usa: "US",
  "united states": "US",
  canada: "CA",
  ca: "CA",
  brazil: "BR",
  br: "BR",
  // Middle East / Africa
  uae: "AE",
  ae: "AE",
  dubai: "AE",
  "saudi arabia": "SA",
  sa: "SA",
  // Group
  group: "GRP",
  grp: "GRP",
  consolidated: "GRP",
  global: "GRP",
};

// ---------------------------------------------------------------------------
// Severity keywords
// ---------------------------------------------------------------------------

const SEVERITY_KEYWORDS: Record<string, string> = {
  critical: "critical",
  crit: "critical",
  severe: "critical",
  urgent: "critical",
  high: "high",
  important: "high",
  medium: "medium",
  moderate: "medium",
  low: "low",
  minor: "low",
};

// ---------------------------------------------------------------------------
// Intent rules — ordered by specificity (most specific first)
// ---------------------------------------------------------------------------

interface IntentRule {
  /** Unique rule name for debug trace */
  name: string;
  /** Question type to map to */
  questionType: CopilotQuestionType;
  /** Keywords that MUST be present (at least one from each group) */
  requiredGroups: string[][];
  /** Keywords that boost score if present */
  boostKeywords: string[];
  /** Base confidence when rule matches */
  baseConfidence: number;
  /** Display label template (use {entity} for extracted entity) */
  labelTemplate: string;
}

const INTENT_RULES: IntentRule[] = [
  // --- Simulation / What-if (most specific, match first) ---
  {
    name: "simulate_what_if",
    questionType: "SIMULATE_CLOSE",
    requiredGroups: [["what if", "whatif", "simulat", "scenario", "model"]],
    boostKeywords: ["close", "breach", "blocker", "resolve", "expedite", "extend", "deadline", "resource"],
    baseConfidence: 0.85,
    labelTemplate: "Run close simulation for {entity}",
  },
  {
    name: "simulate_impact",
    questionType: "SIMULATE_CLOSE",
    requiredGroups: [["impact", "effect", "project", "hypothetical"]],
    boostKeywords: ["close", "resolve", "blocker", "defect", "deadline", "extend", "what"],
    baseConfidence: 0.75,
    labelTemplate: "Project impact on close for {entity}",
  },

  // --- Root cause analysis ---
  {
    name: "root_cause_explicit",
    questionType: "ROOT_CAUSE_ANALYSIS",
    requiredGroups: [["root cause", "root-cause", "rootcause", "causal", "diagnos"]],
    boostKeywords: ["close", "risk", "breach", "why", "trace", "evidence", "chain", "factor"],
    baseConfidence: 0.85,
    labelTemplate: "Root cause analysis for {entity}",
  },
  {
    name: "root_cause_implicit",
    questionType: "ROOT_CAUSE_ANALYSIS",
    requiredGroups: [["causing", "underlying", "source of", "driving"]],
    boostKeywords: ["risk", "breach", "delay", "problem", "issue", "close", "red", "degraded"],
    baseConfidence: 0.75,
    labelTemplate: "Trace root causes for {entity}",
  },

  // --- Autonomous orchestration ---
  {
    name: "orchestrate_explicit",
    questionType: "ORCHESTRATE_CLOSE",
    requiredGroups: [["orchestrat", "automat", "auto-execut", "autoexecut"]],
    boostKeywords: ["close", "action", "rule", "gate", "governance", "defect", "queue"],
    baseConfidence: 0.85,
    labelTemplate: "Evaluate automation rules for {entity}",
  },
  {
    name: "orchestrate_implicit",
    questionType: "ORCHESTRATE_CLOSE",
    requiredGroups: [["kill switch", "rate limit", "cooldown", "governance gate"]],
    boostKeywords: ["automation", "close", "action", "rule", "status", "check"],
    baseConfidence: 0.75,
    labelTemplate: "Check orchestration governance for {entity}",
  },

  // --- Auto-campaign proposal (most specific, match first) ---
  {
    name: "propose_campaigns_explicit",
    questionType: "PROPOSE_CAMPAIGNS",
    requiredGroups: [["suggest", "propos", "auto", "recommend"]],
    boostKeywords: ["campaign", "defect", "cluster", "bundle", "group", "draft", "create"],
    baseConfidence: 0.85,
    labelTemplate: "Suggest campaigns from defect clusters",
  },
  {
    name: "propose_campaigns_cluster",
    questionType: "PROPOSE_CAMPAIGNS",
    requiredGroups: [["campaign"]],
    boostKeywords: ["suggest", "propos", "auto", "recommend", "draft", "create", "defect", "cluster"],
    baseConfidence: 0.75,
    labelTemplate: "Auto-propose campaigns for {entity}",
  },

  // --- Multi-step flows (most specific, match first) ---
  {
    name: "remediate_gaps_explicit",
    questionType: "REMEDIATE_GAPS",
    requiredGroups: [["campaign", "remediat", "bundle", "group"]],
    boostKeywords: ["critical", "gap", "defect", "posting", "create", "prepare"],
    baseConfidence: 0.85,
    labelTemplate: "Create campaign for critical gaps",
  },
  {
    name: "batch_overdue_explicit",
    questionType: "BATCH_OVERDUE",
    requiredGroups: [["overdue", "batch", "stale", "aged"]],
    boostKeywords: ["defect", "accept", "prepare", "bulk", "pending", "old"],
    baseConfidence: 0.85,
    labelTemplate: "Show overdue defects and prepare batch",
  },
  {
    name: "export_and_review_explicit",
    questionType: "EXPORT_AND_REVIEW",
    requiredGroups: [["export", "download", "cert"]],
    boostKeywords: ["pack", "exception", "review", "certification"],
    baseConfidence: 0.85,
    labelTemplate: "Export cert pack and review exceptions",
  },

  // --- Narrative generation ---
  {
    name: "narrative_controller",
    questionType: "NARRATIVE_CONTROLLER",
    requiredGroups: [["controller", "close"]],
    boostKeywords: ["brief", "narrative", "report", "generate", "prepare"],
    baseConfidence: 0.85,
    labelTemplate: "Generate controller close brief",
  },
  {
    name: "narrative_cfo",
    questionType: "NARRATIVE_CFO",
    requiredGroups: [["cfo", "chief financial"]],
    boostKeywords: ["brief", "briefing", "narrative", "report", "generate", "executive"],
    baseConfidence: 0.85,
    labelTemplate: "Generate CFO briefing",
  },
  {
    name: "narrative_audit",
    questionType: "NARRATIVE_AUDIT",
    requiredGroups: [["audit"]],
    boostKeywords: ["committee", "summary", "report", "control", "generate", "prepare"],
    baseConfidence: 0.85,
    labelTemplate: "Generate audit committee summary",
  },
  {
    name: "narrative_board",
    questionType: "NARRATIVE_BOARD",
    requiredGroups: [["board"]],
    boostKeywords: ["summary", "report", "brief", "generate", "prepare", "director"],
    baseConfidence: 0.85,
    labelTemplate: "Generate board close summary",
  },
  {
    name: "narrative_generic",
    questionType: "NARRATIVE_CONTROLLER",
    requiredGroups: [["narrative", "brief", "report"]],
    boostKeywords: ["generate", "create", "prepare", "write", "close"],
    baseConfidence: 0.70,
    labelTemplate: "Generate close narrative for {entity}",
  },

  // --- Core question types ---
  {
    name: "why_red_color",
    questionType: "WHY_RED",
    requiredGroups: [["red", "amber", "yellow", "risk"]],
    boostKeywords: ["why", "reason", "cause", "status", "color", "score"],
    baseConfidence: 0.80,
    labelTemplate: "Why is {entity} at risk?",
  },
  {
    name: "why_red_blocking",
    questionType: "WHY_RED",
    requiredGroups: [["block", "stuck", "problem", "issue", "wrong", "fail"]],
    boostKeywords: ["close", "hard", "entity", "what", "why"],
    baseConfidence: 0.75,
    labelTemplate: "What is blocking close for {entity}?",
  },
  {
    name: "breach_risk_miss",
    questionType: "BREACH_RISK",
    requiredGroups: [["miss", "breach", "late", "slip", "delay"]],
    boostKeywords: ["hard", "close", "entity", "which", "who", "deadline", "sla"],
    baseConfidence: 0.80,
    labelTemplate: "Which entity will miss hard close?",
  },
  {
    name: "breach_risk_entity",
    questionType: "BREACH_RISK",
    requiredGroups: [["breach"]],
    boostKeywords: ["probability", "forecast", "risk", "tier", "ranking"],
    baseConfidence: 0.80,
    labelTemplate: "Breach risk analysis",
  },
  {
    name: "today_actions_do",
    questionType: "TODAY_ACTIONS",
    requiredGroups: [["do", "action", "task", "priority", "focus"]],
    boostKeywords: ["today", "now", "next", "should", "what", "my", "pending"],
    baseConfidence: 0.75,
    labelTemplate: "What should I do today?",
  },
  {
    name: "today_actions_urgent",
    questionType: "TODAY_ACTIONS",
    requiredGroups: [["urgent", "immediate", "asap"]],
    boostKeywords: ["action", "do", "task", "what", "need"],
    baseConfidence: 0.75,
    labelTemplate: "What needs immediate attention?",
  },
  {
    name: "what_changed_delta",
    questionType: "WHAT_CHANGED",
    requiredGroups: [["change", "differ", "delta", "move", "shift", "new"]],
    boostKeywords: ["yesterday", "since", "last", "recent", "today", "what", "gl", "override"],
    baseConfidence: 0.75,
    labelTemplate: "What changed since yesterday?",
  },
  {
    name: "executive_summary_brief",
    questionType: "EXECUTIVE_SUMMARY",
    requiredGroups: [["summary", "brief", "overview", "status", "executive", "cfo"]],
    boostKeywords: ["give", "show", "quick", "overall", "kpi", "metric"],
    baseConfidence: 0.70,
    labelTemplate: "Executive summary for {entity}",
  },

  // --- Fallback intent patterns ---
  {
    name: "defect_queue_mention",
    questionType: "WHY_RED",
    requiredGroups: [["defect", "gap", "exception", "override"]],
    boostKeywords: ["how", "many", "count", "list", "show"],
    baseConfidence: 0.60,
    labelTemplate: "Status assessment for {entity}",
  },
  {
    name: "certification_mention",
    questionType: "EXPORT_AND_REVIEW",
    requiredGroups: [["certif", "pack", "evidence"]],
    boostKeywords: ["status", "ready", "complete", "sign"],
    baseConfidence: 0.60,
    labelTemplate: "Certification status for {entity}",
  },
  {
    name: "remediation_mention",
    questionType: "REMEDIATE_GAPS",
    requiredGroups: [["remediat"]],
    boostKeywords: ["campaign", "action", "pending", "resolve"],
    baseConfidence: 0.60,
    labelTemplate: "Remediation status for {entity}",
  },
  {
    name: "forecast_mention",
    questionType: "BREACH_RISK",
    requiredGroups: [["forecast", "predict", "estimat", "timeline"]],
    boostKeywords: ["close", "completion", "when", "days"],
    baseConfidence: 0.60,
    labelTemplate: "Close forecast for {entity}",
  },
];

// ---------------------------------------------------------------------------
// Parser implementation
// ---------------------------------------------------------------------------

function normalizeInput(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEntity(normalized: string): string | undefined {
  // Try multi-word aliases first (longest match)
  const multiWordAliases = Object.keys(ENTITY_ALIASES)
    .filter((k) => k.includes(" "))
    .sort((a, b) => b.length - a.length);

  for (const alias of multiWordAliases) {
    if (normalized.includes(alias)) {
      return ENTITY_ALIASES[alias];
    }
  }

  // Try single-word aliases — only match whole words
  const words = normalized.split(" ");
  for (const word of words) {
    // Skip very short words that are common English (e.g. "in", "us", "my")
    // unless they appear capitalized in the original or are standalone
    if (word.length <= 2 && ["in", "us", "my", "do", "id"].includes(word)) {
      continue;
    }
    if (ENTITY_ALIASES[word]) {
      return ENTITY_ALIASES[word];
    }
  }

  // Try 2-3 letter uppercase codes in the original text (e.g. "MY", "SG")
  const codeMatch = normalized.match(/\b([a-z]{2,3})\b/g);
  if (codeMatch) {
    for (const code of codeMatch) {
      if (ENTITY_ALIASES[code] && code.length >= 2) {
        // Only return if it's a known alias that isn't a common word
        if (!["in", "us", "my", "do", "id", "is", "it", "or", "an", "as", "at", "be", "by", "if", "no", "on", "so", "to", "up", "we"].includes(code)) {
          return ENTITY_ALIASES[code];
        }
      }
    }
  }

  return undefined;
}

function extractSeverity(normalized: string): string | undefined {
  const words = normalized.split(" ");
  for (const word of words) {
    if (SEVERITY_KEYWORDS[word]) {
      return SEVERITY_KEYWORDS[word];
    }
  }
  return undefined;
}

function extractPeriod(normalized: string): number | undefined {
  // "period 3", "P3", "p3", "period three"
  const periodMatch = normalized.match(/(?:period|p)\s*(\d{1,2})/);
  if (periodMatch) {
    const num = parseInt(periodMatch[1], 10);
    if (num >= 1 && num <= 13) return num;
  }

  // Word numbers
  const wordNumbers: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const wordMatch = normalized.match(/period\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)/);
  if (wordMatch) {
    return wordNumbers[wordMatch[1]];
  }

  return undefined;
}

function extractFiscalYear(normalized: string): number | undefined {
  // "FY2025", "fy 2025", "fiscal year 2025", "FY25"
  const fyMatch = normalized.match(/(?:fy|fiscal\s*year)\s*(\d{2,4})/);
  if (fyMatch) {
    let year = parseInt(fyMatch[1], 10);
    if (year < 100) year += 2000;
    if (year >= 2020 && year <= 2040) return year;
  }
  return undefined;
}

function scoreRule(rule: IntentRule, words: string[], normalized: string): number {
  // Check required groups — at least one keyword from each group must match (substring)
  for (const group of rule.requiredGroups) {
    const groupMatched = group.some((keyword) =>
      words.some((w) => w.includes(keyword) || keyword.includes(w)) ||
      normalized.includes(keyword),
    );
    if (!groupMatched) return 0;
  }

  // Base score
  let score = rule.baseConfidence;

  // Boost for matching boost keywords
  let boostCount = 0;
  for (const bk of rule.boostKeywords) {
    if (words.some((w) => w.includes(bk) || bk.includes(w)) || normalized.includes(bk)) {
      boostCount++;
    }
  }

  // Each boost keyword adds up to 0.03 (max boost: ~0.15)
  score += Math.min(boostCount * 0.03, 0.15);

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse freeform natural language input into a structured copilot intent.
 * Deterministic — no LLM, keyword/pattern matching with scored rules.
 */
export function parseCopilotIntent(text: string): CopilotParsedIntent {
  const normalized = normalizeInput(text);
  const words = normalized.split(" ");

  // Extract context hints
  const entityHint = extractEntity(normalized);
  const severityHint = extractSeverity(normalized);
  const periodHint = extractPeriod(normalized);
  const fiscalYearHint = extractFiscalYear(normalized);

  // Score all rules
  let bestRule: IntentRule | null = null;
  let bestScore = 0;

  for (const rule of INTENT_RULES) {
    const score = scoreRule(rule, words, normalized);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  // Fallback to EXECUTIVE_SUMMARY if no rule matched
  if (!bestRule || bestScore < 0.4) {
    return {
      questionType: "EXECUTIVE_SUMMARY",
      confidence: 0.3,
      entityHint,
      severityHint,
      periodHint,
      fiscalYearHint,
      originalText: text,
      displayLabel: entityHint
        ? `General status for ${entityHint}`
        : "General status overview",
      matchRule: "fallback_executive_summary",
    };
  }

  // Build display label
  const displayLabel = bestRule.labelTemplate.replace(
    "{entity}",
    entityHint ?? "current entity",
  );

  return {
    questionType: bestRule.questionType,
    confidence: bestScore,
    entityHint,
    severityHint,
    periodHint,
    fiscalYearHint,
    originalText: text,
    displayLabel,
    matchRule: bestRule.name,
  };
}

/**
 * Register additional entity aliases at runtime (e.g. from tenant configuration).
 * Merges into the existing alias map.
 */
export function registerEntityAliases(aliases: Record<string, string>): void {
  for (const [key, code] of Object.entries(aliases)) {
    ENTITY_ALIASES[key.toLowerCase()] = code.toUpperCase();
  }
}
