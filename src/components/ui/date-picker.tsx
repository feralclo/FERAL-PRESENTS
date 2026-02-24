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
  /** IANA timezone (e.g. "Europe/London"). When set, display and parsing use this timezone */
  timezone?: string
  /** Show timezone abbreviation in the popover */
  showTimezone?: boolean
}

function DateTimePicker({
  value,
  onChange,
  className,
  placeholder = "Pick date & time",
  timezone,
  showTimezone = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  // When timezone is provided, we interpret the value as UTC and display in that timezone.
  // The internal "local" representation (YYYY-MM-DDTHH:mm) is in the target timezone.
  const localValue = React.useMemo(() => {
    if (!value) return null
    if (timezone) {
      // Convert UTC ISO → timezone-local datetime string
      const d = new Date(value)
      if (isNaN(d.getTime())) return null
      try {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(d)
        const get = (type: string) => parts.find((p) => p.type === type)?.value || "00"
        return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`
      } catch {
        return null
      }
    }
    // No timezone — parse as-is
    const d = new Date(value)
    if (isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    return `${y}-${mo}-${dd}T${hh}:${mm}`
  }, [value, timezone])

  // Parse the local value for display
  const parsed = localValue ? new Date(localValue) : null
  const isValid = parsed && !isNaN(parsed.getTime())

  const selectedDate = isValid ? parsed : null
  const hours = isValid ? String(parsed.getHours()).padStart(2, "0") : "12"
  const minutes = isValid ? String(parsed.getMinutes()).padStart(2, "0") : "00"

  // Display text — use timezone formatting when available
  const displayText = React.useMemo(() => {
    if (!value) return null
    const d = new Date(value)
    if (isNaN(d.getTime())) return null
    if (timezone) {
      return d.toLocaleDateString("en-GB", {
        timeZone: timezone,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    }
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }, [value, timezone])

  // Get timezone abbreviation for display
  const tzAbbr = React.useMemo(() => {
    if (!timezone || !showTimezone) return null
    try {
      const f = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        timeZoneName: "shortOffset",
      })
      const parts = f.formatToParts(new Date())
      return parts.find((p) => p.type === "timeZoneName")?.value || null
    } catch {
      return null
    }
  }, [timezone, showTimezone])

  const buildLocalValue = (date: Date, h: string, m: string) => {
    const y = date.getFullYear()
    const mo = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${mo}-${d}T${h.padStart(2, "0")}:${m.padStart(2, "0")}`
  }

  const emitChange = (localStr: string) => {
    if (timezone) {
      // Convert timezone-local → UTC ISO
      const [datePart, timePart] = localStr.split("T")
      if (!datePart || !timePart) return
      const [yr, mn, dy] = datePart.split("-").map(Number)
      const [hr, mi] = timePart.split(":").map(Number)

      const utcGuess = new Date(Date.UTC(yr, mn - 1, dy, hr, mi))
      try {
        const inTz = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(utcGuess)
        const get = (type: string) => Number(inTz.find((p) => p.type === type)?.value || "0")
        const tzHour = get("hour") === 24 ? 0 : get("hour")
        const wanted = new Date(Date.UTC(yr, mn - 1, dy, hr, mi))
        const got = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), tzHour, get("minute")))
        const corrected = new Date(utcGuess.getTime() - (got.getTime() - wanted.getTime()))
        onChange(corrected.toISOString())
      } catch {
        onChange(localStr)
      }
    } else {
      onChange(localStr)
    }
  }

  const handleDateSelect = (date: Date) => {
    emitChange(buildLocalValue(date, hours, minutes))
  }

  const handleTimeChange = (h: string, m: string) => {
    if (!selectedDate) {
      emitChange(buildLocalValue(new Date(), h, m))
    } else {
      emitChange(buildLocalValue(selectedDate, h, m))
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
          {tzAbbr && (
            <span className="shrink-0 text-[10px] text-muted-foreground/60 font-mono">
              {tzAbbr}
            </span>
          )}
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
          {showTimezone && tzAbbr && (
            <span className="text-[10px] text-muted-foreground/60 font-mono ml-auto">
              {tzAbbr}
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker, DateTimePicker }
