/**
 * Generate smart, context-aware next-step suggestions based on project files.
 * Returns max 3 suggestions — focused and actionable.
 */
export function generateSuggestions(files: string[]): string[] {
  const suggestions: string[] = [];
  const allPaths = files.map((f) => f.toLowerCase()).join(" ");

  const has = (keywords: string[]) =>
    keywords.some((kw) => allPaths.includes(kw));

  // Core missing features — highest priority
  if (!has(["auth", "login", "signin", "signup"])) {
    suggestions.push("Add user authentication with login & signup pages");
  }

  if (!has(["pricing", "plans", "subscription", "billing"])) {
    suggestions.push("Add a pricing page with plan comparison");
  }

  if (!has(["dashboard", "analytics", "stats", "metric"])) {
    suggestions.push("Add an analytics dashboard with charts");
  }

  if (!has(["settings", "profile", "account"])) {
    suggestions.push("Add user settings and profile page");
  }

  if (!has(["contact", "form"])) {
    suggestions.push("Add a contact form with validation");
  }

  if (!has(["about"])) {
    suggestions.push("Add an about page with team section");
  }

  if (!has(["search"])) {
    suggestions.push("Add search with filters");
  }

  if (!has(["notification", "toast"])) {
    suggestions.push("Add toast notifications");
  }

  if (!has(["mobile", "responsive"])) {
    suggestions.push("Improve mobile responsiveness");
  }

  return suggestions.slice(0, 3);
}
