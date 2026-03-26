/**
 * Generate smart next-step suggestions based on what files exist in the project.
 * Returns max 4 suggestions.
 */
export function generateSuggestions(files: string[]): string[] {
  const suggestions: string[] = [];
  const fileLower = files.map((f) => f.toLowerCase());
  const allContent = fileLower.join(" ");

  const hasMatch = (keywords: string[]) =>
    keywords.some((kw) => allContent.includes(kw));

  if (!hasMatch(["auth", "login", "signin", "sign-in", "signup", "sign-up"])) {
    suggestions.push("Add user authentication");
  }

  if (!hasMatch(["pricing", "plans", "subscription"])) {
    suggestions.push("Create a pricing page");
  }

  if (!hasMatch(["footer"])) {
    suggestions.push("Add a footer with social links");
  }

  if (!hasMatch(["404", "not-found", "notfound"])) {
    suggestions.push("Add a 404 page");
  }

  if (!hasMatch(["dark-mode", "darkmode", "theme-toggle", "themetoggle", "dark"])) {
    suggestions.push("Add dark mode toggle");
  }

  if (!hasMatch(["review", "testimonial", "feedback"])) {
    suggestions.push("Add customer reviews");
  }

  if (!hasMatch(["contact", "contact-form", "contactform"])) {
    suggestions.push("Add a contact form");
  }

  if (!hasMatch(["search"])) {
    suggestions.push("Add search functionality");
  }

  return suggestions.slice(0, 4);
}
