import { telemetryRepository } from "../../storage/telemetryRepository";
import { notifyTelemetryOutboxWorker } from "../../events/outboxNotifier";
import { createTelemetryApplication } from "./useCases";

export const telemetryApplication = createTelemetryApplication({
  repository: telemetryRepository,
  clock: Date.now,
  outboxNotifier: {
    notify: notifyTelemetryOutboxWorker,
  },
});
