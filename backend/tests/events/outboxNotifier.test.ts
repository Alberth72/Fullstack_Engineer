import { afterEach, describe, expect, it, vi } from "vitest";

const mockPost = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
  default: {
    post: mockPost,
  },
}));

import { notifyTelemetryOutboxWorker } from "../../src/events/outboxNotifier";
import type { TraceContext } from "../../src/observability/tracing";

describe("outbox notifier", () => {
  const originalUrl = process.env.OUTBOX_WORKER_URL;
  const originalAdminToken = process.env.ADMIN_API_TOKEN;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.OUTBOX_WORKER_URL;
    } else {
      process.env.OUTBOX_WORKER_URL = originalUrl;
    }

    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_API_TOKEN;
    } else {
      process.env.ADMIN_API_TOKEN = originalAdminToken;
    }

    vi.clearAllMocks();
  });

  it("posts a notification to the worker service", async () => {
    process.env.OUTBOX_WORKER_URL = "http://worker:4002";
    mockPost.mockResolvedValue({ status: 202 });

    await notifyTelemetryOutboxWorker([
      {
        id: "evt-1",
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 45,
        status: "moving",
        timestamp: 1700000000000,
      },
    ]);

    expect(mockPost).toHaveBeenCalledWith(
      "http://worker:4002/internal/outbox/notify",
      expect.objectContaining({
        count: 1,
        eventIds: ["evt-1"],
      }),
      expect.objectContaining({
        timeout: expect.any(Number),
      })
    );
  });

  it("forwards admin token to the worker when configured", async () => {
    process.env.OUTBOX_WORKER_URL = "http://worker:4002";
    process.env.ADMIN_API_TOKEN = "secret-token";
    mockPost.mockResolvedValue({ status: 202 });

    await notifyTelemetryOutboxWorker([
      {
        id: "evt-1",
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 45,
        status: "moving",
        timestamp: 1700000000000,
      },
    ]);

    expect(mockPost).toHaveBeenCalledWith(
      "http://worker:4002/internal/outbox/notify",
      expect.any(Object),
      expect.objectContaining({
        headers: {
          "X-Admin-Token": "secret-token",
        },
      })
    );
  });

  it("forwards trace headers and body metadata to the worker", async () => {
    process.env.OUTBOX_WORKER_URL = "http://worker:4002";
    mockPost.mockResolvedValue({ status: 202 });
    const trace: TraceContext = {
      traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      spanId: "bbbbbbbbbbbbbbbb",
      parentSpanId: null,
      requestId: "req-test",
      sampled: true,
    };

    await notifyTelemetryOutboxWorker(
      [
        {
          id: "evt-1",
          vehicle_id: "veh-1",
          latitude: 19.43,
          longitude: -99.13,
          speed: 45,
          status: "moving",
          timestamp: 1700000000000,
        },
      ],
      trace
    );

    expect(mockPost).toHaveBeenCalledWith(
      "http://worker:4002/internal/outbox/notify",
      expect.objectContaining({
        trace: expect.objectContaining({
          traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          parentSpanId: "bbbbbbbbbbbbbbbb",
          requestId: "req-test",
        }),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Trace-Id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "X-Request-Id": "req-test",
          traceparent: expect.stringMatching(
            /^00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-[a-f0-9]{16}-01$/
          ),
        }),
      })
    );
  });

  it("skips notification when the worker url is not configured", async () => {
    delete process.env.OUTBOX_WORKER_URL;
    mockPost.mockClear();

    await notifyTelemetryOutboxWorker([
      {
        id: "evt-2",
        vehicle_id: "veh-2",
        latitude: 19.44,
        longitude: -99.14,
        speed: 0,
        status: "stopped",
        timestamp: 1700000005000,
      },
    ]);

    expect(mockPost).not.toHaveBeenCalled();
  });
});
