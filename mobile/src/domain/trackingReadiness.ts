export type TrackingReadinessInput = {
  foregroundPermission: string;
  backgroundPermission: string;
  foregroundCanAskAgain: boolean;
  backgroundCanAskAgain: boolean;
  taskManagerAvailable: boolean;
  backgroundAvailable: boolean;
  taskRegistered: boolean;
  geofencingTaskRegistered: boolean;
  backendOnline: boolean;
};

export type TrackingReadinessStatus = "ready" | "warning" | "blocked";

export type TrackingReadiness = {
  status: TrackingReadinessStatus;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  checklist: Array<{
    key: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
};

export function evaluateTrackingReadiness(input: TrackingReadinessInput): TrackingReadiness {
  const checklist = [
    {
      key: "foreground_permission",
      label: "Permiso en uso",
      ok: input.foregroundPermission === "granted",
      detail: input.foregroundPermission,
    },
    {
      key: "background_permission",
      label: "Permiso segundo plano",
      ok: input.backgroundPermission === "granted",
      detail: input.backgroundPermission,
    },
    {
      key: "task_manager",
      label: "Task manager",
      ok: input.taskManagerAvailable,
      detail: input.taskManagerAvailable ? "available" : "unavailable",
    },
    {
      key: "background_location",
      label: "Background GPS",
      ok: input.backgroundAvailable,
      detail: input.backgroundAvailable ? "available" : "unavailable",
    },
    {
      key: "location_task",
      label: "Task GPS",
      ok: input.taskRegistered,
      detail: input.taskRegistered ? "registered" : "not_registered",
    },
    {
      key: "geofence_task",
      label: "Task geofence",
      ok: input.geofencingTaskRegistered,
      detail: input.geofencingTaskRegistered ? "registered" : "not_registered",
    },
    {
      key: "backend",
      label: "Backend",
      ok: input.backendOnline,
      detail: input.backendOnline ? "online" : "offline",
    },
  ];

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.foregroundPermission !== "granted") {
    blockers.push(
      input.foregroundCanAskAgain ? "request_foreground_location" : "enable_foreground_location_in_settings"
    );
  }

  if (input.backgroundPermission !== "granted") {
    blockers.push(
      input.backgroundCanAskAgain ? "request_background_location" : "enable_background_location_in_settings"
    );
  }

  if (!input.taskManagerAvailable) blockers.push("task_manager_unavailable");
  if (!input.backgroundAvailable) blockers.push("background_location_unavailable");
  if (!input.backendOnline) warnings.push("backend_offline_sync_will_queue");
  if (!input.taskRegistered) warnings.push("gps_task_not_registered");
  if (!input.geofencingTaskRegistered) warnings.push("geofence_task_not_registered");

  const status: TrackingReadinessStatus =
    blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    status,
    ready: status === "ready",
    blockers,
    warnings,
    checklist,
  };
}
