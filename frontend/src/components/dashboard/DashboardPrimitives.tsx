import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(139,94,52,0.14)",
        borderRadius: "24px",
        padding: "18px",
        boxShadow: "0 20px 50px rgba(74, 53, 31, 0.1)",
      }}
    >
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "999px",
              background: "#8b5e34",
              boxShadow: "0 0 0 6px rgba(139, 94, 52, 0.12)",
            }}
          />
          <h2 style={{ margin: 0, fontSize: "22px" }}>{title}</h2>
        </div>
        <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: "13px", lineHeight: 1.5 }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone: "dark" | "green" | "amber" | "red";
  hint: string;
}) {
  const palette = {
    dark: { bg: "linear-gradient(180deg, #1f2937 0%, #111827 100%)", fg: "#fff", accent: "#8b5e34" },
    green: { bg: "linear-gradient(180deg, #ecf9ef 0%, #dff3e4 100%)", fg: "#166534", accent: "#1f7a3a" },
    amber: { bg: "linear-gradient(180deg, #fff6df 0%, #f7ebc8 100%)", fg: "#92400e", accent: "#b66a08" },
    red: { bg: "linear-gradient(180deg, #fff0f0 0%, #f9dfdf 100%)", fg: "#991b1b", accent: "#b91c1c" },
  }[tone];

  return (
    <div
      style={{
        background: palette.bg,
        color: palette.fg,
        borderRadius: "22px",
        padding: "18px",
        minHeight: "112px",
        boxShadow: "0 16px 34px rgba(0,0,0,0.08)",
        border: "1px solid rgba(255,255,255,0.4)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: "0 auto auto 0", width: "100%", height: "4px", background: palette.accent }} />
      <div style={{ fontSize: "12px", opacity: 0.82, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: "32px", fontWeight: 800, marginTop: "10px", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "12px", marginTop: "10px", opacity: 0.76 }}>{hint}</div>
    </div>
  );
}

export function SmallStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "green" | "amber" | "red" | "neutral";
}) {
  const palette = {
    green: {
      bg: "linear-gradient(180deg, #eefbf1 0%, #ddf5e3 100%)",
      fg: "#166534",
      accent: "#22c55e",
    },
    amber: {
      bg: "linear-gradient(180deg, #fff7e0 0%, #f9ebc5 100%)",
      fg: "#92400e",
      accent: "#f59e0b",
    },
    red: {
      bg: "linear-gradient(180deg, #fff0f0 0%, #fde0e0 100%)",
      fg: "#991b1b",
      accent: "#ef4444",
    },
    neutral: {
      bg: "#fff",
      fg: "#5b5248",
      accent: "#d6c7b7",
    },
  }[tone];

  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.accent}55`,
        borderRadius: "16px",
        padding: "12px 14px",
        boxShadow: tone === "neutral" ? "none" : "0 10px 20px rgba(74, 53, 31, 0.06)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: "0 auto auto 0", width: "100%", height: "3px", background: palette.accent }} />
      <div style={{ fontSize: "12px", color: palette.fg, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontWeight: 800, color: palette.fg }}>{value}</div>
    </div>
  );
}

export function InlineRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "10px 0",
        borderBottom: "1px solid #f0e5d8",
      }}
    >
      <span style={{ color: "#6b7280", fontSize: "13px" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function AlertBadge({ level, text }: { level: "high" | "medium" | "low"; text: string }) {
  const styles =
    level === "high"
      ? { bg: "#fdecec", fg: "#991b1b", label: "ALTA", accent: "#dc2626" }
      : level === "medium"
      ? { bg: "#fff4dd", fg: "#92400e", label: "MEDIA", accent: "#d97706" }
      : { bg: "#e8f7ec", fg: "#166534", label: "BAJA", accent: "#16a34a" };

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        padding: "12px 14px",
        background: styles.bg,
        borderRadius: "16px",
        border: `1px solid ${styles.accent}1f`,
        boxShadow: "0 10px 18px rgba(74, 53, 31, 0.05)",
      }}
    >
      <span style={{ fontSize: "11px", fontWeight: 800, color: styles.fg, minWidth: "48px", letterSpacing: "0.08em" }}>
        {styles.label}
      </span>
      <span style={{ color: "#1f2937", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

export function VehicleStatusPill({ status }: { status: string }) {
  const background =
    status === "moving"
      ? "#166534"
      : status === "stopped"
      ? "#92400e"
      : status === "offline"
      ? "#991b1b"
      : "#5b5248";

  return (
    <span
      style={{
        fontSize: "11px",
        color: "#fff",
        background,
        borderRadius: "999px",
        padding: "4px 8px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

export function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "neutral";
}) {
  const palette = {
    green: { bg: "#e8f7ec", fg: "#166534" },
    amber: { bg: "#fff4dd", fg: "#92400e" },
    red: { bg: "#fdecec", fg: "#991b1b" },
    neutral: { bg: "#f3efe8", fg: "#5b5248" },
  }[tone];

  return (
    <div
      style={{
        display: "inline-flex",
        gap: "10px",
        alignItems: "center",
        padding: "10px 14px",
        borderRadius: "999px",
        background: palette.bg,
        color: palette.fg,
        fontSize: "13px",
        fontWeight: 700,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
      }}
    >
      <span style={{ opacity: 0.8, fontWeight: 600 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function MiniCommandStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        borderRadius: "16px",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(248,244,238,0.68)" }}>
        {label}
      </div>
      <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 800, color: "#fff" }}>{value}</div>
    </div>
  );
}

export function Pill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 10px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.08)",
        color: "#f8f4ee",
        fontSize: "12px",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {label}
    </span>
  );
}
