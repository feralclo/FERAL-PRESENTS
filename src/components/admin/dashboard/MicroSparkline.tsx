"use client";

import { useMemo } from "react";

interface MicroSparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  variant?: "area" | "bar";
  className?: string;
}

function MicroSparkline({
  data,
  color = "#34D399",
  height = 32,
  width = 120,
  variant = "area",
  className,
}: MicroSparklineProps) {
  const { path, areaPath, barRects, gradientId } = useMemo(() => {
    const id = `sparkline-${Math.random().toString(36).slice(2, 9)}`;
    if (data.length === 0) return { path: "", areaPath: "", barRects: [], gradientId: id };

    const max = Math.max(...data, 1);
    const padding = 1;
    const usableW = width - padding * 2;
    const usableH = height - padding * 2;

    if (variant === "bar") {
      const barWidth = Math.max(usableW / data.length - 1, 2);
      const gap = 1;
      const rects = data.map((v, i) => {
        const barH = (v / max) * usableH;
        const x = padding + i * (barWidth + gap);
        const y = padding + usableH - barH;
        return { x, y, w: barWidth, h: Math.max(barH, 1) };
      });
      return { path: "", areaPath: "", barRects: rects, gradientId: id };
    }

    // Area variant
    const points = data.map((v, i) => ({
      x: padding + (i / Math.max(data.length - 1, 1)) * usableW,
      y: padding + usableH - (v / max) * usableH,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const area = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { path: linePath, areaPath: area, barRects: [], gradientId: id };
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
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {variant === "bar" ? (
        <g>
          {barRects.map((r, i) => {
            const isLast = i === data.length - 1;
            return (
              <rect
                key={i}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={1}
                fill={isLast ? color : `${color}40`}
                opacity={isLast ? 1 : 0.6}
              />
            );
          })}
        </g>
      ) : (
        <g>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

export { MicroSparkline };
