/**
 * SpecLock — Baked-in constraint detection and enforcement.
 * Detects "always", "never", "must", "don't change" patterns from conversation.
 * Stores constraints per project. Checks new prompts against locked constraints.
 */

export interface Constraint {
  id: string;
  text: string;
  source: "auto" | "user";
  createdAt: number;
}

/** Keywords that signal a constraint in any language */
const CONSTRAINT_PATTERNS = [
  // English
  /\b(always|never|must|don'?t ever|do not|must not|keep|maintain|don'?t change|don'?t remove|make sure|ensure)\b/i,
  // Hindi
  /\b(हमेशा|कभी नहीं|ज़रूर|मत बदलो|रखना|बदलना मत|हटाना मत)\b/,
  // Gujarati
  /\b(હંમેશા|ક્યારેય નહીં|જરૂર|બદલશો નહીં|રાખો)\b/,
  // Arabic
  /\b(دائما|أبدا|يجب|لا تغير|لا تحذف)\b/,
  // Spanish
  /\b(siempre|nunca|debe|no cambies|no elimines|mantener)\b/i,
];

/** Extract constraint text from a message */
export function detectConstraints(message: string): string[] {
  const detected: string[] = [];

  // Check each sentence for constraint patterns
  const sentences = message.split(/[.!?\n]+/).filter((s) => s.trim().length > 5);

  for (const sentence of sentences) {
    for (const pattern of CONSTRAINT_PATTERNS) {
      if (pattern.test(sentence)) {
        detected.push(sentence.trim());
        break;
      }
    }
  }

  return detected;
}

/** Check if a proposed action conflicts with existing constraints */
export function checkConflict(
  action: string,
  constraints: Constraint[]
): { conflicts: boolean; matched: Constraint[] } {
  const matched: Constraint[] = [];
  const actionLower = action.toLowerCase();

  for (const constraint of constraints) {
    const constraintLower = constraint.text.toLowerCase();

    // Simple keyword overlap check
    const constraintWords = constraintLower
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const actionWords = actionLower.split(/\s+/).filter((w) => w.length > 3);

    // Check for contradictory intent
    const hasNever = /never|don'?t|not|नहीं|مت|nunca/.test(constraintLower);
    const overlap = constraintWords.filter((w) => actionWords.includes(w));

    if (hasNever && overlap.length >= 2) {
      matched.push(constraint);
    }
  }

  return { conflicts: matched.length > 0, matched };
}

/** Format constraints for injection into system prompt */
export function formatConstraintsForPrompt(constraints: Constraint[]): string {
  if (constraints.length === 0) return "";

  const lines = constraints.map(
    (c, i) => `${i + 1}. 🔒 ${c.text} (${c.source === "user" ? "user-set" : "auto-detected"})`
  );

  return `\n## ACTIVE CONSTRAINTS (SpecLock)\nThe following constraints are locked for this project. You MUST follow them:\n${lines.join("\n")}\n`;
}
