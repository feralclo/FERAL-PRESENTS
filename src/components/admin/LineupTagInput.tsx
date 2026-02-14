"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LineupTagInputProps {
  lineup: string[];
  onChange: (lineup: string[]) => void;
  className?: string;
}

export function LineupTagInput({
  lineup,
  onChange,
  className,
}: LineupTagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addArtist = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || lineup.includes(trimmed)) return;
      onChange([...lineup, trimmed]);
    },
    [lineup, onChange]
  );

  const removeArtist = useCallback(
    (index: number) => {
      onChange(lineup.filter((_, i) => i !== index));
    },
    [lineup, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addArtist(inputValue);
        setInputValue("");
      } else if (
        e.key === "Backspace" &&
        inputValue === "" &&
        lineup.length > 0
      ) {
        removeArtist(lineup.length - 1);
      }
    },
    [inputValue, lineup, addArtist, removeArtist]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      if (pasted.includes(",")) {
        e.preventDefault();
        const names = pasted
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const unique = names.filter((n) => !lineup.includes(n));
        if (unique.length > 0) {
          onChange([...lineup, ...unique]);
        }
        setInputValue("");
      }
    },
    [lineup, onChange]
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[42px] rounded-md border border-input bg-background/50 px-3 py-2 cursor-text transition-colors duration-200 focus-within:border-primary/50 focus-within:ring-[3px] focus-within:ring-primary/15"
        onClick={() => inputRef.current?.focus()}
      >
        {lineup.map((artist, i) => (
          <Badge
            key={i}
            variant="secondary"
            className="gap-1 pr-1 font-mono text-xs"
          >
            {artist}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeArtist(i);
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
              aria-label={`Remove ${artist}`}
            >
              <X size={10} />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (inputValue.trim()) {
              addArtist(inputValue);
              setInputValue("");
            }
          }}
          placeholder={
            lineup.length === 0 ? "Type artist name, press Enter to add" : ""
          }
          className="flex-1 min-w-[160px] bg-transparent border-none outline-none text-sm font-mono text-foreground placeholder:text-muted-foreground/50 py-0.5"
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        Press Enter or comma to add. Backspace to remove last. Paste comma-separated lists.
      </p>
    </div>
  );
}
