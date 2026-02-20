import { cn } from "@/lib/utils";

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 30;

interface RadialGaugeProps {
  value: number;
  max: number;
  color: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  displayValue: string;
  variant?: "standard" | "hero";
  className?: string;
}

/**
 * SVG radial gauge with animated fill.
 * `variant="hero"` renders larger (120px) for full-width hero sections.
 */
export function RadialGauge({
  value,
  max,
  color,
  icon: Icon,
  label,
  displayValue,
  variant = "standard",
  className,
}: RadialGaugeProps) {
  const isHero = variant === "hero";
  const svgSize = isHero ? 120 : 72;
  const strokeWidth = isHero ? 6 : 5;
  const percent = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = GAUGE_CIRCUMFERENCE * (1 - percent);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center rounded-2xl rep-surface-1",
        isHero ? "p-6" : "px-2 pt-4 pb-3",
        className,
      )}
    >

      <svg
        className="-rotate-90"
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        style={{ width: svgSize, height: svgSize }}
      >
        <circle
          fill="none"
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth={strokeWidth}
          cx={svgSize / 2}
          cy={svgSize / 2}
          r="30"
        />
        <circle
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          cx={svgSize / 2}
          cy={svgSize / 2}
          r="30"
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1200 ease-out"
          style={{ filter: `drop-shadow(0 0 3px ${color}60)` }}
        />
      </svg>

      {/* Center icon */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          top: isHero ? 24 : 16,
          width: svgSize,
          height: svgSize,
        }}
      >
        <Icon
          size={isHero ? 24 : 18}
          style={{ color }}
        />
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-2">
        {label}
      </p>
      <p
        className={cn(
          "font-extrabold tabular-nums leading-none mt-0.5",
          isHero ? "text-[28px]" : "text-lg",
        )}
        style={{ color }}
      >
        {displayValue}
      </p>
    </div>
  );
}
