"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

/** Monday = 0, Sunday = 6 */
function getMondayStartDay(year: number, month: number) {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

interface CalendarProps {
  selected?: Date | null
  onSelect?: (date: Date) => void
  className?: string
}

function Calendar({ selected, onSelect, className }: CalendarProps) {
  const today = new Date()
  const [viewYear, setViewYear] = React.useState(
    selected ? selected.getFullYear() : today.getFullYear()
  )
  const [viewMonth, setViewMonth] = React.useState(
    selected ? selected.getMonth() : today.getMonth()
  )

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const startDay = getMondayStartDay(viewYear, viewMonth)
  const prevMonthDays = getDaysInMonth(
    viewMonth === 0 ? viewYear - 1 : viewYear,
    viewMonth === 0 ? 11 : viewMonth - 1
  )

  const goToPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const goToNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = []

  // Previous month trailing days
  for (let i = startDay - 1; i >= 0; i--) {
    const m = viewMonth === 0 ? 11 : viewMonth - 1
    const y = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ day: prevMonthDays - i, month: m, year: y, isCurrentMonth: false })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: viewMonth, year: viewYear, isCurrentMonth: true })
  }

  // Next month leading days
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1
    const y = viewMonth === 11 ? viewYear + 1 : viewYear
    cells.push({ day: d, month: m, year: y, isCurrentMonth: false })
  }

  // Only show 5 rows if last row is all next-month
  const rows = cells.length > 35 && !cells.slice(35).some((c) => c.isCurrentMonth) ? 5 : 6
  const visibleCells = cells.slice(0, rows * 7)

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className={cn("w-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={goToPrev}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={goToNext}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="flex h-8 items-center justify-center text-[11px] font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {visibleCells.map((cell, i) => {
          const cellDate = new Date(cell.year, cell.month, cell.day)
          const isToday = isSameDay(cellDate, today)
          const isSelected = selected ? isSameDay(cellDate, selected) : false

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect?.(cellDate)}
              className={cn(
                "flex h-8 w-full items-center justify-center rounded-md text-sm transition-colors",
                !cell.isCurrentMonth && "text-muted-foreground/40",
                cell.isCurrentMonth && !isSelected && "text-foreground hover:bg-primary/10",
                isToday && !isSelected && "font-semibold text-primary",
                isSelected &&
                  "bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
              )}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
