import { describe, expect, it } from "vitest";
import { buildOperationalDiagnostics } from "../../src/observability/diagnostics";
import type { RuntimeHealth } from "../../src/observability/runtimeHealth";

function degradedRuntimeHealth(): RuntimeHealth {
  return {
    status: "degraded",
    timestamp: Date.now(),
    broker: "rabbitmq",
    database: "postgres",
    checks: {
      broker: {
        configured: true,
        connected: false,
        mode: "rabbitmq",
      },
      database: {
        configured: true,
        connected: false,
        mode: "postgres",
      },
    },
  };
}

describe("operational diagnostics alerts", () => {
  it("builds critical alerts for disconnected configured dependencies", () => {
    const diagnostics = buildOperationalDiagnostics({
      role: "api",
      runtimeHealth: degradedRuntimeHealth(),
    });

    expect(diagnostics.attentionRequired).toBe(true);
    expect(diagnostics.alertSummary.bySeverity.critical).toBeGreaterThanOrEqual(2);
    expect(diagnostics.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          code: "broker_unavailable",
          source: "runtime",
        }),
        expect.objectContaining({
          severity: "critical",
          code: "database_unavailable",
          source: "runtime",
        }),
      ])
    );
  });
});
