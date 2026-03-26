/**
 * Language detection and supported languages for VibeLock.
 * Detects user's language from input text using script analysis.
 */

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  direction: "ltr" | "rtl";
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", script: "latin", direction: "ltr" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", script: "devanagari", direction: "ltr" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", script: "gujarati", direction: "ltr" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", script: "devanagari", direction: "ltr" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", script: "tamil", direction: "ltr" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", script: "telugu", direction: "ltr" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", script: "bengali", direction: "ltr" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", script: "kannada", direction: "ltr" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", script: "malayalam", direction: "ltr" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", script: "gurmukhi", direction: "ltr" },
  { code: "ur", name: "Urdu", nativeName: "اردو", script: "arabic", direction: "rtl" },
  { code: "ar", name: "Arabic", nativeName: "العربية", script: "arabic", direction: "rtl" },
  { code: "es", name: "Spanish", nativeName: "Español", script: "latin", direction: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", script: "latin", direction: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", script: "latin", direction: "ltr" },
  { code: "zh", name: "Chinese", nativeName: "中文", script: "cjk", direction: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", script: "cjk", direction: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", script: "hangul", direction: "ltr" },
  { code: "th", name: "Thai", nativeName: "ไทย", script: "thai", direction: "ltr" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", script: "latin", direction: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", script: "latin", direction: "ltr" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", script: "latin", direction: "ltr" },
];

/** Script detection ranges */
const SCRIPT_RANGES: [string, RegExp][] = [
  ["devanagari", /[\u0900-\u097F]/],
  ["gujarati", /[\u0A80-\u0AFF]/],
  ["tamil", /[\u0B80-\u0BFF]/],
  ["telugu", /[\u0C00-\u0C7F]/],
  ["bengali", /[\u0980-\u09FF]/],
  ["kannada", /[\u0C80-\u0CFF]/],
  ["malayalam", /[\u0D00-\u0D7F]/],
  ["gurmukhi", /[\u0A00-\u0A7F]/],
  ["arabic", /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/],
  ["thai", /[\u0E00-\u0E7F]/],
  ["hangul", /[\uAC00-\uD7AF\u1100-\u11FF]/],
  ["cjk", /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F]/],
];

/**
 * Common Romanized Hindi/Hinglish words.
 * If 2+ of these appear in Latin-script text, it's Hinglish.
 */
// ONLY words that are UNAMBIGUOUSLY Hindi — no English false positives
// Removed: "app", "do", "the", "par", "se", "ko", "ka", "ki", "ya" (all valid English)
const HINGLISH_WORDS = new Set([
  // Verbs — clearly Hindi
  "banao", "karo", "dikhao", "batao", "bhejo", "likho", "padho", "kholna",
  "hatao", "lagao", "jodo", "badlo", "rakho", "chalo", "dekho",
  "samjhao", "sikhao", "dalo", "nikalo", "bechna", "khareedna",
  // Pronouns — clearly Hindi
  "mujhe", "mera", "meri", "mere", "humko", "hamara", "tumhara", "uska",
  "iska", "sabka", "kisi", "kuch",
  // Postpositions — only unambiguous ones
  "chahiye", "chahte", "wala", "wali", "wale", "liye", "mein",
  "hai", "hain", "tha",
  // Nouns — clearly Hindi
  "dukaan", "ghar", "kaam", "paisa", "cheez", "jagah", "tarika", "namaste",
  // Adjectives
  "accha", "bura", "bada", "chhota", "naya", "purana", "sundar", "asaan",
  // Phrases — only unambiguous
  "lekin", "abhi", "pehle", "baad", "yahan", "wahan", "kaise", "kyun", "kya", "kitna", "kaun",
]);

/**
 * Detect if text contains Romanized Hindi/Hinglish.
 * Returns true if 2+ Hinglish words found in the text.
 */
function isHinglish(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  let count = 0;
  for (const word of words) {
    // Strip punctuation
    const clean = word.replace(/[^a-z]/g, "");
    if (clean.length >= 3 && HINGLISH_WORDS.has(clean)) {
      count++;
      if (count >= 3) return true; // Need 3+ Hindi words to be confident
    }
  }
  return false;
}

/**
 * Detect the language of user input.
 * Priority: Native script detection → Romanized Hindi → English default.
 */
export function detectLanguage(text: string): Language {
  // Check for non-Latin scripts first
  for (const [script, regex] of SCRIPT_RANGES) {
    const matches = text.match(new RegExp(regex.source, "g"));
    if (matches && matches.length >= 2) {
      const lang = SUPPORTED_LANGUAGES.find((l) => l.script === script);
      if (lang) return lang;
    }
  }

  // Check for Romanized Hindi/Hinglish (Latin script but Hindi words)
  if (isHinglish(text)) {
    return { code: "hi-latn", name: "Hinglish", nativeName: "Hinglish", script: "latin", direction: "ltr" };
  }

  // Default to English
  return SUPPORTED_LANGUAGES[0];
}

/**
 * Get a language by code.
 */
export function getLanguage(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}
