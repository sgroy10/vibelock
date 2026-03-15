/**
 * SpecLock Constraint Detector
 * Lightweight safety pattern detection for VibeLock.
 * Phase 1: Regex-based detection. Phase 2: speclock npm package integration.
 */

export interface SpecLockResult {
  safe: boolean;
  warnings: string[];
  category: 'safe' | 'caution' | 'blocked';
}

const CAUTION_PATTERNS = [
  { pattern: /rm\s+-rf\s+\//, label: 'Destructive file system command detected' },
  { pattern: /DROP\s+TABLE|DELETE\s+FROM.*WHERE\s+1/i, label: 'Destructive database operation detected' },
  { pattern: /eval\s*\(|new\s+Function\s*\(/i, label: 'Dynamic code execution pattern detected' },
  { pattern: /sudo\s+/i, label: 'Elevated privilege command detected' },
];

const BLOCKED_PATTERNS = [
  { pattern: /generate.*malware|create.*virus|write.*exploit/i, label: 'Malicious code generation request blocked' },
  { pattern: /hack\s+into|break\s+into.*system/i, label: 'Unauthorized access request blocked' },
];

export function detectConstraints(prompt: string): SpecLockResult {
  const warnings: string[] = [];

  for (const { pattern, label } of BLOCKED_PATTERNS) {
    if (pattern.test(prompt)) {
      return { safe: false, warnings: [label], category: 'blocked' };
    }
  }

  for (const { pattern, label } of CAUTION_PATTERNS) {
    if (pattern.test(prompt)) {
      warnings.push(label);
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
    category: warnings.length > 0 ? 'caution' : 'safe',
  };
}
