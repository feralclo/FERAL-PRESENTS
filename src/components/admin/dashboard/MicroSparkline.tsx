"use client";

import { useMemo, useId } from "react";

interface MicroSparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  variant?: "area" | "bar";
  className?: string;
  /** Show a glowing dot at the last data point */
  showDot?: boolean;
  /** Animate bars growing up on mount */
  animate?: boolean;
}

/**
 * Attempt smooth cubic spline through points.
 * Falls back to straight lines for < 3 points.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function MicroSparkline({
  data,
  color = "#34D399",
  height = 40,
  width = 120,
  variant = "area",
  className,
  showDot = false,
  animate = false,
}: MicroSparklineProps) {
  const baseId = useId();
  const gradientId = `spark-${baseId}`;
  const glowId = `glow-${baseId}`;

  const { linePath, areaPath, barRects, lastPoint } = useMemo(() => {
    if (data.length === 0) return { linePath: "", areaPath: "", barRects: [] as { x: number; y: number; w: number; h: number }[], lastPoint: null };

    const max = Math.max(...data, 1);
    const pad = 2;
    const usableW = width - pad * 2;
    const usableH = height - pad * 2;

    if (variant === "bar") {
      const gap = Math.max(1, Math.min(2, usableW / data.length * 0.15));
      const barW = Math.max((usableW - gap * (data.length - 1)) / data.length, 2);
      const rects = data.map((v, i) => {
        const barH = Math.max((v / max) * usableH, 1);
        return {
          x: pad + i * (barW + gap),
          y: pad + usableH - barH,
          w: barW,
          h: barH,
        };
      });
      return { linePath: "", areaPath: "", barRects: rects, lastPoint: null };
    }

    // Area variant with smooth curves
    const points = data.map((v, i) => ({
      x: pad + (i / Math.max(data.length - 1, 1)) * usableW,
      y: pad + usableH - (v / max) * usableH,
    }));

    const line = smoothPath(points);
    const last = points[points.length - 1];
    const first = points[0];
    const area = `${line} L ${last.x} ${height} L ${first.x} ${height} Z`;

    return { linePath: line, areaPath: area, barRects: [], lastPoint: last };
  }, [data, height, width, variant]);

  if (data.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="60%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        {showDot && (
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {variant === "bar" ? (
        <g>
          {barRects.map((r, i) => {
            const isLast = i === data.length - 1;
            const isCurrent = i >= data.length - 2;
            const opacity = isLast ? 1 : isCurrent ? 0.8 : 0.35 + (i / data.length) * 0.3;
            return (
              <rect
                key={i}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={Math.min(r.w / 3, 2)}
                fill={color}
                opacity={opacity}
                style={animate ? {
                  animation: `bar-grow 600ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 30}ms both`,
                  transformOrigin: `${r.x + r.w / 2}px ${height}px`,
                } : undefined}
              />
            );
          })}
          {/* Glow on the last bar */}
          {barRects.length > 0 && data[data.length - 1] > 0 && (
            <rect
              x={barRects[barRects.length - 1].x - 2}
              y={barRects[barRects.length - 1].y - 2}
              width={barRects[barRects.length - 1].w + 4}
              height={barRects[barRects.length - 1].h + 4}
              rx={3}
              fill="none"
              stroke={color}
              strokeWidth={0.5}
              opacity={0.3}
            />
          )}
        </g>
      ) : (
        <g>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {showDot && lastPoint && (
            <g filter={`url(#${glowId})`}>
              <circle cx={lastPoint.x} cy={lastPoint.y} r={3.5} fill={color} />
              <circle cx={lastPoint.x} cy={lastPoint.y} r={6} fill={color} opacity={0.2}>
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

export { MicroSparkline };
