import type {
  DriverTelemetryPayload,
  SyncBatchRequest,
  SyncBatchResponse,
} from "../contracts/telemetry";
import type { TelemetryTransport } from "../services/telemetrySyncService";

type HttpTelemetryTransportOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
};

export type BackendHealthSnapshot = {
  online: boolean;
  status: string | null;
  broker: string | null;
  database: string | null;
};

export class HttpTelemetryTransport implements TelemetryTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: HttpTelemetryTransportOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = options.headers ?? {};
  }

  async syncBatch(request: SyncBatchRequest): Promise<SyncBatchResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/telemetry/events/batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`sync_batch_failed_${response.status}`);
    }

    const data = (await response.json()) as {
      status?: string;
      count?: number;
      accepted?: number;
      rejected?: number;
      serverTimestamp?: number;
      duplicateEventIds?: string[];
    };

    return {
      accepted: data.accepted ?? data.count ?? request.events.length,
      rejected: data.rejected ?? 0,
      serverTimestamp: data.serverTimestamp ?? Date.now(),
      duplicateEventIds: data.duplicateEventIds ?? [],
    };
  }

  async pushSingle(payload: DriverTelemetryPayload): Promise<SyncBatchResponse> {
    return this.syncBatch({ events: [payload] });
  }

  async checkHealth(): Promise<BackendHealthSnapshot> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, {
        headers: this.headers,
      });

      if (!response.ok) {
        return {
          online: false,
          status: null,
          broker: null,
          database: null,
        };
      }

      const data = (await response.json()) as {
        status?: string;
        broker?: string;
        database?: string;
      };

      return {
        online: data.status === "ok",
        status: data.status ?? null,
        broker: data.broker ?? null,
        database: data.database ?? null,
      };
    } catch {
      return {
        online: false,
        status: null,
        broker: null,
        database: null,
      };
    }
  }
}
