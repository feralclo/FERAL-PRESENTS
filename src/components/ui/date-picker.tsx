"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/* ──────────────────────────────────────────────
   DatePicker — date-only (value = "YYYY-MM-DD")
   ────────────────────────────────────────────── */

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

function DatePicker({ value, onChange, className, placeholder = "Pick a date" }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = value ? new Date(value + "T00:00:00") : null

  const displayText = selected
    ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null

  const handleSelect = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    onChange(`${y}-${m}-${d}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background/50 px-3 py-1 text-sm text-foreground transition-colors hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/15",
            !value && "text-muted-foreground/60",
            className
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 opacity-50" />
          <span className="flex-1 text-left">{displayText || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Calendar selected={selected} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  )
}

/* ──────────────────────────────────────────────────
   DateTimePicker — date + time (value = "YYYY-MM-DDTHH:mm"
   or ISO string — outputs "YYYY-MM-DDTHH:mm")
   ────────────────────────────────────────────────── */

interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

function DateTimePicker({
  value,
  onChange,
  className,
  placeholder = "Pick date & time",
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Parse the value — handle both "YYYY-MM-DDTHH:mm" and ISO strings
  const parsed = value ? new Date(value) : null
  const isValid = parsed && !isNaN(parsed.getTime())

  const selectedDate = isValid ? parsed : null
  const hours = isValid ? String(parsed.getHours()).padStart(2, "0") : "12"
  const minutes = isValid ? String(parsed.getMinutes()).padStart(2, "0") : "00"

  const displayText = isValid
    ? parsed.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  const buildValue = (date: Date, h: string, m: string) => {
    const y = date.getFullYear()
    const mo = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${mo}-${d}T${h.padStart(2, "0")}:${m.padStart(2, "0")}`
  }

  const handleDateSelect = (date: Date) => {
    onChange(buildValue(date, hours, minutes))
  }

  const handleTimeChange = (h: string, m: string) => {
    if (!selectedDate) {
      // If no date selected yet, use today
      onChange(buildValue(new Date(), h, m))
    } else {
      onChange(buildValue(selectedDate, h, m))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background/50 px-3 py-1 text-sm text-foreground transition-colors hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/15",
            !value && "text-muted-foreground/60",
            className
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 opacity-50" />
          <span className="flex-1 text-left truncate">
            {displayText || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Calendar selected={selectedDate} onSelect={handleDateSelect} />
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Time</span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={23}
              value={hours}
              onChange={(e) => {
                const v = Math.min(23, Math.max(0, Number(e.target.value)))
                handleTimeChange(String(v), minutes)
              }}
              className="h-8 w-14 text-center font-mono text-xs tabular-nums"
            />
            <span className="text-sm font-bold text-muted-foreground">:</span>
            <Input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => {
                const v = Math.min(59, Math.max(0, Number(e.target.value)))
                handleTimeChange(hours, String(v).padStart(2, "0"))
              }}
              className="h-8 w-14 text-center font-mono text-xs tabular-nums"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker, DateTimePicker }
