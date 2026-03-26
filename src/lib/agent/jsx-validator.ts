/**
 * JSX Syntax Validator — checks generated JSX/TSX files for common
 * syntax errors BEFORE writing to disk. Catches issues that would
 * cause Vite build failures.
 *
 * This runs after the AI generates code and before the executor writes files.
 * If fixable errors are found, they're auto-corrected. If not, the specific
 * error is reported for the retry loop.
 */

export interface ValidationResult {
  valid: boolean;
  fixed: boolean;
  content: string;
  errors: string[];
}

/**
 * Validate and auto-fix JSX content.
 * Returns corrected content + list of any unfixable errors.
 */
export function validateJSX(filePath: string, content: string): ValidationResult {
  // Only validate JSX/TSX files
  if (!/\.(jsx|tsx)$/.test(filePath)) {
    return { valid: true, fixed: false, content, errors: [] };
  }

  const errors: string[] = [];
  let fixed = false;
  let result = content;

  // 1. Check for duplicate imports and remove them
  const lines = result.split("\n");
  const seenImports = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("import ") && trimmed.includes(" from ")) {
      if (seenImports.has(trimmed)) {
        fixed = true;
        continue; // skip duplicate
      }
      seenImports.add(trimmed);
    }
    deduped.push(line);
  }
  result = deduped.join("\n");

  // 2. Remove explicit React imports (not needed in React 18)
  if (/^import\s+React\s+from\s+['"]react['"];?\s*$/m.test(result)) {
    result = result.replace(/^import\s+React\s+from\s+['"]react['"];?\s*\n/m, "");
    fixed = true;
  }
  // Convert "import React, { useState } from 'react'" to "import { useState } from 'react'"
  result = result.replace(
    /^(import\s+)React\s*,\s*(\{[^}]+\}\s+from\s+['"]react['"])/gm,
    "$1$2"
  );

  // 3. Fix apostrophes in JSX text — the #1 cause of "Unclosed string literal"
  // Replace bare apostrophes in JSX text content (not in strings or attributes)
  // e.g., "You haven't" → "You haven&apos;t"
  result = result.replace(
    />([\s\S]*?)</g,
    (match) => match.replace(/(\w)'(\w)/g, "$1&apos;$2")
  );

  // 4. Check JSX tag balance (simplified but catches common errors)
  const tagErrors = checkTagBalance(result);
  if (tagErrors.length > 0) {
    errors.push(...tagErrors);
  }

  // 4. Check for common JSX mistakes
  // class= instead of className=
  if (/\bclass\s*=\s*["'{]/m.test(result) && !/className/m.test(result)) {
    result = result.replace(/\bclass\s*=\s*/g, "className=");
    fixed = true;
  }

  // onclick= instead of onClick=
  result = result.replace(/\bonclick\s*=/gi, "onClick=");
  result = result.replace(/\bonchange\s*=/gi, "onChange=");
  result = result.replace(/\bonsubmit\s*=/gi, "onSubmit=");

  // 5. Check for unclosed string literals in JSX attributes
  const unclosedStr = findUnclosedStrings(result);
  if (unclosedStr) {
    errors.push(`Unclosed string literal near: ${unclosedStr}`);
  }

  // 6. Remove any stray vibelock tags that leaked in
  if (/<\/?vibelock-/.test(result)) {
    result = result.replace(/<\/?vibelock-[^>]*>/g, "");
    fixed = true;
  }

  // 7. Remove markdown code fences
  if (/^```/.test(result) || /\n```/.test(result)) {
    result = result.replace(/^```(?:\w+)?\s*\n/gm, "");
    result = result.replace(/\n```\s*$/g, "");
    result = result.replace(/\n```\s*\n/g, "\n");
    fixed = true;
  }

  return {
    valid: errors.length === 0,
    fixed,
    content: result,
    errors,
  };
}

/**
 * Check that JSX/HTML-like tags are balanced.
 * Returns list of mismatched tags found.
 */
function checkTagBalance(code: string): string[] {
  const errors: string[] = [];

  // Extract JSX from the return statement area (skip imports/logic)
  const returnMatch = code.match(/return\s*\(\s*([\s\S]*)\s*\)\s*;?\s*\}?\s*$/);
  if (!returnMatch) return errors;

  const jsx = returnMatch[1];

  // Find all opening and closing tags
  const tagStack: { tag: string; line: number }[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9.]*)[^>]*?\/?>/g;
  let match;

  const lines = jsx.split("\n");
  let lineNum = 0;
  let charCount = 0;

  while ((match = tagRegex.exec(jsx)) !== null) {
    // Calculate line number
    while (lineNum < lines.length - 1 && charCount + lines[lineNum].length < match.index) {
      charCount += lines[lineNum].length + 1;
      lineNum++;
    }

    const fullTag = match[0];
    const tagName = match[1];

    // Skip self-closing tags
    if (fullTag.endsWith("/>")) continue;
    // Skip void elements
    if (["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"].includes(tagName.toLowerCase())) continue;
    // Skip React fragments
    if (tagName === "" || fullTag === "<>" || fullTag === "</>") continue;

    if (fullTag.startsWith("</")) {
      // Closing tag
      if (tagStack.length === 0) {
        errors.push(`Unexpected closing tag </${tagName}> with no matching opening tag`);
      } else {
        const top = tagStack[tagStack.length - 1];
        if (top.tag === tagName) {
          tagStack.pop();
        } else {
          errors.push(`Tag mismatch: opened <${top.tag}> but closed with </${tagName}>`);
          // Try to recover — pop the stack if the tag exists deeper
          const idx = tagStack.findLastIndex((t) => t.tag === tagName);
          if (idx !== -1) {
            tagStack.splice(idx);
          }
        }
      }
    } else {
      // Opening tag
      tagStack.push({ tag: tagName, line: lineNum });
    }
  }

  // Check for unclosed tags
  for (const unclosed of tagStack) {
    errors.push(`Unclosed tag <${unclosed.tag}>`);
  }

  return errors;
}

/**
 * Simple check for unclosed string literals that would break JSX parsing.
 */
function findUnclosedStrings(code: string): string | null {
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Count unescaped quotes
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const prev = j > 0 ? line[j - 1] : "";
      if (prev === "\\") continue;
      if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
      if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
      if (ch === "`" && !inSingle && !inDouble) inTemplate = !inTemplate;
    }
    // Template literals can span lines, so only flag single/double
    if (inSingle || inDouble) {
      return `line ${i + 1}: ${line.trim().slice(0, 60)}`;
    }
  }
  return null;
}
