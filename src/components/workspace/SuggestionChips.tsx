"use client";

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export default function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium text-orange-600 bg-white border border-orange-200 hover:bg-orange-50 hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 cursor-pointer"
        >
          <span className="text-[11px]">{"\u2728"}</span>
          {suggestion}
        </button>
      ))}
    </div>
  );
}
