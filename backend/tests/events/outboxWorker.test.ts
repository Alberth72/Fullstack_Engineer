import { afterEach, describe, expect, it, vi } from "vitest";

const mockClaimPendingOutbox = vi.hoisted(() => vi.fn());
const mockMarkOutboxPublished = vi.hoisted(() => vi.fn());
const mockMarkOutboxRetry = vi.hoisted(() => vi.fn());
const mockMarkOutboxDead = vi.hoisted(() => vi.fn());
const mockPublishTelemetryBatchStrict = vi.hoisted(() => vi.fn());

vi.mock("../../src/storage/telemetryOutbox", () => ({
  claimPendingOutbox: mockClaimPendingOutbox,
  markOutboxPublished: mockMarkOutboxPublished,
  markOutboxRetry: mockMarkOutboxRetry,
  markOutboxDead: mockMarkOutboxDead,
}));

vi.mock("../../src/events/broadcaster", () => ({
  publishTelemetryBatchStrict: mockPublishTelemetryBatchStrict,
}));

import { runTelemetryOutboxCycle } from "../../src/events/outboxWorker";

describe("outbox worker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("publishes claimed outbox entries", async () => {
    const record = {
      id: "evt-1",
      payload: {
        id: "evt-1",
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 45,
        status: "moving",
        timestamp: 1700000000000,
      },
      status: "processing",
      attempts: 1,
      maxAttempts: 8,
      nextAttemptAt: Date.now(),
      lockedAt: Date.now(),
      lastError: null,
      publishedAt: null,
    } as const;

    mockClaimPendingOutbox.mockResolvedValue([record]);
    mockPublishTelemetryBatchStrict.mockResolvedValue(undefined);

    await runTelemetryOutboxCycle();

    expect(mockClaimPendingOutbox).toHaveBeenCalledTimes(1);
    expect(mockPublishTelemetryBatchStrict).toHaveBeenCalledWith([record.payload]);
    expect(mockMarkOutboxPublished).toHaveBeenCalledWith([record.id]);
    expect(mockMarkOutboxRetry).not.toHaveBeenCalled();
    expect(mockMarkOutboxDead).not.toHaveBeenCalled();
  });

  it("publishes multiple claimed entries as one broker batch", async () => {
    const records = [
      {
        id: "evt-1",
        payload: {
          id: "evt-1",
          vehicle_id: "veh-1",
          latitude: 19.43,
          longitude: -99.13,
          speed: 45,
          status: "moving",
          timestamp: 1700000000000,
        },
        status: "processing",
        attempts: 1,
        maxAttempts: 8,
        nextAttemptAt: Date.now(),
        lockedAt: Date.now(),
        lastError: null,
        publishedAt: null,
      },
      {
        id: "evt-2",
        payload: {
          id: "evt-2",
          vehicle_id: "veh-2",
          latitude: 19.44,
          longitude: -99.14,
          speed: 0,
          status: "stopped",
          timestamp: 1700000005000,
        },
        status: "processing",
        attempts: 1,
        maxAttempts: 8,
        nextAttemptAt: Date.now(),
        lockedAt: Date.now(),
        lastError: null,
        publishedAt: null,
      },
    ] as const;

    mockClaimPendingOutbox.mockResolvedValue(records);
    mockPublishTelemetryBatchStrict.mockResolvedValue(undefined);

    await runTelemetryOutboxCycle();

    expect(mockPublishTelemetryBatchStrict).toHaveBeenCalledTimes(1);
    expect(mockPublishTelemetryBatchStrict).toHaveBeenCalledWith(
      records.map((record) => record.payload)
    );
    expect(mockMarkOutboxPublished).toHaveBeenCalledWith(["evt-1", "evt-2"]);
    expect(mockMarkOutboxRetry).not.toHaveBeenCalled();
    expect(mockMarkOutboxDead).not.toHaveBeenCalled();
  });

  it("reschedules failed entries until they exhaust attempts", async () => {
    const record = {
      id: "evt-2",
      payload: {
        id: "evt-2",
        vehicle_id: "veh-2",
        latitude: 19.44,
        longitude: -99.14,
        speed: 0,
        status: "stopped",
        timestamp: 1700000005000,
      },
      status: "processing",
      attempts: 2,
      maxAttempts: 8,
      nextAttemptAt: Date.now(),
      lockedAt: Date.now(),
      lastError: null,
      publishedAt: null,
    } as const;

    mockClaimPendingOutbox.mockResolvedValue([record]);
    mockPublishTelemetryBatchStrict.mockRejectedValue(new Error("broker_down"));

    await runTelemetryOutboxCycle();

    expect(mockMarkOutboxRetry).toHaveBeenCalledWith(
      record,
      "broker_down",
      expect.any(Number)
    );
    expect(mockMarkOutboxPublished).not.toHaveBeenCalled();
    expect(mockMarkOutboxDead).not.toHaveBeenCalled();
  });

  it("dead-letters entries that already exhausted attempts", async () => {
    const record = {
      id: "evt-3",
      payload: {
        id: "evt-3",
        vehicle_id: "veh-3",
        latitude: 19.45,
        longitude: -99.15,
        speed: 0,
        status: "stopped",
        timestamp: 1700000009000,
      },
      status: "processing",
      attempts: 8,
      maxAttempts: 8,
      nextAttemptAt: Date.now(),
      lockedAt: Date.now(),
      lastError: null,
      publishedAt: null,
    } as const;

    mockClaimPendingOutbox.mockResolvedValue([record]);
    mockPublishTelemetryBatchStrict.mockRejectedValue(new Error("broker_down"));

    await runTelemetryOutboxCycle();

    expect(mockMarkOutboxDead).toHaveBeenCalledWith(record, "broker_down");
  });
});
