"use client"

import * as React from "react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const PRESET_COLORS = [
  "#8B5CF6", "#7C3AED", "#6D28D9", "#A78BFA",
  "#F43F5E", "#EF4444", "#DC2626", "#FF6B6B",
  "#34D399", "#10B981", "#059669", "#22C55E",
  "#FBBF24", "#F59E0B", "#D97706", "#EAB308",
  "#3B82F6", "#2563EB", "#1D4ED8", "#60A5FA",
  "#EC4899", "#DB2777", "#BE185D", "#F472B6",
  "#FFFFFF", "#F0F0F5", "#8888A0", "#71717A",
  "#1E1E2A", "#111117", "#08080C", "#000000",
]

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  className?: string
}

function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const [hex, setHex] = React.useState(value)
  const nativeRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setHex(value)
  }, [value])

  const handleHexChange = (input: string) => {
    setHex(input)
    if (/^#[0-9A-Fa-f]{6}$/.test(input)) {
      onChange(input)
    }
  }

  const handleHexBlur = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex)
    } else {
      setHex(value)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-md border border-input bg-background/50 px-3 text-sm text-foreground transition-colors hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/15",
            className
          )}
        >
          <span
            className="h-4 w-4 shrink-0 rounded-sm border border-border/60"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-xs uppercase">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[264px] p-3" align="start">
        <div className="space-y-3">
          {/* Preset swatches */}
          <div className="grid grid-cols-8 gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  "h-6 w-6 rounded-sm border transition-all hover:scale-110",
                  value.toLowerCase() === color.toLowerCase()
                    ? "border-primary ring-1 ring-primary"
                    : "border-border/50 hover:border-border"
                )}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onChange(color)
                  setHex(color)
                }}
              />
            ))}
          </div>

          {/* Hex input + native picker fallback */}
          <div className="flex items-center gap-2">
            <Input
              value={hex}
              onChange={(e) => handleHexChange(e.target.value)}
              onBlur={handleHexBlur}
              className="h-8 font-mono text-xs uppercase"
              placeholder="#000000"
              maxLength={7}
            />
            <button
              type="button"
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-background/50 transition-colors hover:border-primary/30"
              onClick={() => nativeRef.current?.click()}
              title="Custom color"
            >
              <span
                className="h-4 w-4 rounded-sm"
                style={{
                  background:
                    "conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)",
                }}
              />
              <input
                ref={nativeRef}
                type="color"
                value={value}
                onChange={(e) => {
                  onChange(e.target.value)
                  setHex(e.target.value)
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
                tabIndex={-1}
              />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { ColorPicker }
