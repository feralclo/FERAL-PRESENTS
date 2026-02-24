"use client";

interface MarketingConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  variant?: "midnight" | "aura";
}

export function MarketingConsentCheckbox({
  checked,
  onChange,
  variant = "midnight",
}: MarketingConsentCheckboxProps) {
  const isMidnight = variant === "midnight";

  return (
    <label className="flex items-start gap-3 cursor-pointer select-none -mt-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
          checked
            ? "bg-emerald-500/15 border-emerald-500/40"
            : isMidnight
              ? "bg-white/[0.04] border-white/10 hover:border-white/20"
              : "bg-transparent border-zinc-300 hover:border-zinc-400"
        }`}
      >
        {checked && (
          <svg
            width="10"
            height="8"
            viewBox="0 0 10 8"
            fill="none"
            className="text-emerald-400"
          >
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <span
        className={`text-xs leading-relaxed ${
          isMidnight
            ? "font-[family-name:var(--font-sans)] text-foreground/50"
            : "text-muted-foreground"
        }`}
      >
        Keep me updated about future events and offers
      </span>
    </label>
  );
}
