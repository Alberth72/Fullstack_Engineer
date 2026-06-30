import { describe, expect, it } from "vitest";
import {
  inferAgentSpecialist,
  resolveAgentSpecialist,
} from "../../src/agent/agentProfiles";

describe("agent profiles", () => {
  it("infers event backend questions as backend specialists", () => {
    expect(inferAgentSpecialist("Necesito revisar RabbitMQ y retries")).toBe("event_backend");
  });

  it("infers timescale questions as data specialists", () => {
    expect(inferAgentSpecialist("Como optimizo TimescaleDB con hypertables?")).toBe(
      "data_timescale"
    );
  });

  it("infers security questions as security specialists", () => {
    expect(inferAgentSpecialist("Necesitamos hardening, headers y OWASP")).toBe(
      "security_ops"
    );
  });

  it("infers ui questions as ui specialists", () => {
    expect(inferAgentSpecialist("Quiero mejorar el color, tipografia y layout")).toBe(
      "ui_brand"
    );
  });

  it("infers mobile questions as mobile specialists", () => {
    expect(inferAgentSpecialist("Necesitamos offline-first en React Native")).toBe(
      "mobile_edge"
    );
  });

  it("respects an explicit specialist hint", () => {
    expect(resolveAgentSpecialist("cualquier pregunta", "frontend_ops")).toBe("frontend_ops");
  });
});
