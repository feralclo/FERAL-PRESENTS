"use client";

import { useEffect, useState, useCallback } from "react";

interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  latency?: number;
  detail?: string;
}

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  checks: HealthCheck[];
}

const STATUS_CONFIG = {
  ok: { label: "OPERATIONAL", color: "#00c853", bg: "rgba(0, 200, 83, 0.08)" },
  degraded: { label: "DEGRADED", color: "#ffa726", bg: "rgba(255, 167, 38, 0.08)" },
  down: { label: "DOWN", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.08)" },
} as const;

export default function SystemHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthResponse = await res.json();
      setHealth(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch health data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overallConfig = health ? STATUS_CONFIG[health.status] : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 className="admin-section__title" style={{ marginBottom: 0 }}>
          SYSTEM HEALTH
        </h1>
        <button
          onClick={fetchHealth}
          disabled={loading}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: "1px solid #1e1e2a",
            borderRadius: 4,
            color: "#8888a0",
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.7rem",
            letterSpacing: "1px",
            cursor: loading ? "wait" : "pointer",
            transition: "border-color 0.2s",
          }}
        >
          {loading ? "CHECKING..." : "REFRESH"}
        </button>
      </div>

      {/* Overall status banner */}
      {overallConfig && (
        <div
          style={{
            background: overallConfig.bg,
            border: `1px solid ${overallConfig.color}33`,
            borderRadius: 8,
            padding: "20px 24px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: overallConfig.color,
              display: "inline-block",
              boxShadow: `0 0 8px ${overallConfig.color}66`,
              animation: health?.status === "ok" ? "none" : "pulse 2s infinite",
            }}
          />
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.85rem",
              color: overallConfig.color,
              letterSpacing: "2px",
              fontWeight: 700,
            }}
          >
            ALL SYSTEMS {overallConfig.label}
          </span>
          {lastRefresh && (
            <span
              style={{
                marginLeft: "auto",
                color: "#55557a",
                fontSize: "0.7rem",
                fontFamily: "'Space Mono', monospace",
              }}
            >
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="admin-section" style={{ borderColor: "#8B5CF644" }}>
          <p style={{ color: "#8B5CF6", fontFamily: "'Space Mono', monospace", fontSize: "0.8rem" }}>
            Error: {error}
          </p>
        </div>
      )}

      {/* Service status cards */}
      {health && (
        <div className="admin-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {health.checks.map((check) => {
            const config = STATUS_CONFIG[check.status];
            return (
              <div
                key={check.name}
                className="admin-stat-card"
                style={{ position: "relative" }}
              >
                {/* Status indicator */}
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: config.color,
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "0.6rem",
                      color: config.color,
                      letterSpacing: "1px",
                    }}
                  >
                    {config.label}
                  </span>
                </div>

                {/* Service name */}
                <span className="admin-stat-card__label">
                  {check.name.toUpperCase()}
                </span>

                {/* Latency */}
                <span
                  className="admin-stat-card__value"
                  style={{
                    fontSize: check.latency !== undefined ? "1.8rem" : "1rem",
                    color: config.color,
                  }}
                >
                  {check.latency !== undefined ? `${check.latency}ms` : config.label}
                </span>

                {/* Detail */}
                {check.detail && (
                  <span
                    style={{
                      display: "block",
                      marginTop: 8,
                      color: "#6666a0",
                      fontSize: "0.7rem",
                      fontFamily: "'Inter', sans-serif",
                      lineHeight: 1.4,
                      wordBreak: "break-all",
                    }}
                  >
                    {check.detail}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* System info section */}
      {health && (
        <div className="admin-section" style={{ marginTop: 8 }}>
          <h2 className="admin-section__title">PLATFORM INFO</h2>
          <table className="admin-table">
            <tbody>
              <InfoRow label="Framework" value="Next.js 16 (App Router)" />
              <InfoRow label="Database" value="Supabase (PostgreSQL)" />
              <InfoRow label="Payments" value="Stripe" />
              <InfoRow label="Hosting" value="Vercel" />
              <InfoRow label="Test Framework" value="Vitest + Testing Library" />
              <InfoRow label="Test Coverage" value="40 tests (3 suites)" />
              <InfoRow label="Last Health Check" value={health.timestamp} />
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td
        style={{
          color: "#8888a0",
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.7rem",
          letterSpacing: "1px",
          padding: "10px 16px",
          width: "40%",
        }}
      >
        {label.toUpperCase()}
      </td>
      <td
        style={{
          color: "#fff",
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.8rem",
          padding: "10px 16px",
        }}
      >
        {value}
      </td>
    </tr>
  );
}
