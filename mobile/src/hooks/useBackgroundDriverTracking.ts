import { useEffect, useState } from "react";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { GEOFENCING_TASK_NAME } from "../background/geofenceTask";
import { toExpoGeofenceRegions } from "../storage/geofenceZones";
import type { DriverContext } from "../storage/sqliteDriverContext";
import type { MobileEnvironment } from "../app/createMobileEnvironment";
import { BACKGROUND_LOCATION_TASK_NAME } from "../background/locationTask";
import {
  evaluateTrackingReadiness,
  type TrackingReadiness,
} from "../domain/trackingReadiness";

export type BackgroundTrackingState = {
  permission: "undetermined" | "granted" | "denied";
  foregroundPermission: "undetermined" | "granted" | "denied";
  backgroundPermission: "undetermined" | "granted" | "denied";
  foregroundCanAskAgain: boolean;
  backgroundCanAskAgain: boolean;
  tracking: boolean;
  taskManagerAvailable: boolean;
  backgroundAvailable: boolean;
  taskRegistered: boolean;
  geofencingTaskRegistered: boolean;
  readiness: TrackingReadiness;
  error: string | null;
  lastActionAt: number | null;
};

const DEFAULT_READINESS = evaluateTrackingReadiness({
  foregroundPermission: "undetermined",
  backgroundPermission: "undetermined",
  foregroundCanAskAgain: true,
  backgroundCanAskAgain: true,
  taskManagerAvailable: false,
  backgroundAvailable: false,
  taskRegistered: false,
  geofencingTaskRegistered: false,
  backendOnline: false,
});

const DEFAULT_STATE: BackgroundTrackingState = {
  permission: "undetermined",
  foregroundPermission: "undetermined",
  backgroundPermission: "undetermined",
  foregroundCanAskAgain: true,
  backgroundCanAskAgain: true,
  tracking: false,
  taskManagerAvailable: false,
  backgroundAvailable: false,
  taskRegistered: false,
  geofencingTaskRegistered: false,
  readiness: DEFAULT_READINESS,
  error: null,
  lastActionAt: null,
};

const BACKGROUND_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Highest,
  timeInterval: 5000,
  distanceInterval: 5,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: "Fleet Driver activo",
    notificationBody: "Registrando telemetria del conductor en segundo plano",
    notificationColor: "#8c5a2b",
    killServiceOnDestroy: false,
  },
};

export function useBackgroundDriverTracking(environment: MobileEnvironment | null) {
  const [state, setState] = useState<BackgroundTrackingState>(DEFAULT_STATE);

  const refreshTrackingState = async () => {
    if (!environment) {
      return DEFAULT_STATE;
    }

    const [foregroundPermission, backgroundPermission, backgroundAvailable, taskRegistered, taskManagerAvailable, backendHealth] =
      await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        Location.isBackgroundLocationAvailableAsync(),
        Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME),
        TaskManager.isAvailableAsync(),
        environment.transport.checkHealth(),
      ]);
    const geofencingTaskRegistered = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK_NAME);

    const permission =
      foregroundPermission.status === "granted" && backgroundPermission.status === "granted"
        ? "granted"
        : foregroundPermission.status === "denied" || backgroundPermission.status === "denied"
          ? "denied"
          : "undetermined";
    const readiness = evaluateTrackingReadiness({
      foregroundPermission: foregroundPermission.status,
      backgroundPermission: backgroundPermission.status,
      foregroundCanAskAgain: foregroundPermission.canAskAgain,
      backgroundCanAskAgain: backgroundPermission.canAskAgain,
      taskManagerAvailable,
      backgroundAvailable,
      taskRegistered,
      geofencingTaskRegistered,
      backendOnline: backendHealth.online,
    });

    const nextState: BackgroundTrackingState = {
      permission,
      foregroundPermission: foregroundPermission.status,
      backgroundPermission: backgroundPermission.status,
      foregroundCanAskAgain: foregroundPermission.canAskAgain,
      backgroundCanAskAgain: backgroundPermission.canAskAgain,
      tracking: taskRegistered,
      taskManagerAvailable,
      backgroundAvailable,
      taskRegistered,
      geofencingTaskRegistered,
      readiness,
      error: null,
      lastActionAt: state.lastActionAt,
    };

    setState((current) => ({
      ...current,
      ...nextState,
    }));

    return nextState;
  };

  useEffect(() => {
    void refreshTrackingState().catch((error) => {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "tracking_state_error",
      }));
    });
  }, [environment]);

  const startTracking = async (driverProfile: DriverContext) => {
    if (!environment) {
      return;
    }

    setState((current) => ({ ...current, error: null }));

    try {
      const taskAvailable = await TaskManager.isAvailableAsync();
      if (!taskAvailable) {
        throw new Error("background_task_unavailable");
      }

      const foregroundPermission = await Location.requestForegroundPermissionsAsync();
      if (foregroundPermission.status !== "granted") {
        setState((current) => ({
          ...current,
          permission: "denied",
          foregroundPermission: foregroundPermission.status,
          foregroundCanAskAgain: foregroundPermission.canAskAgain,
          tracking: false,
          error: "gps_permission_denied",
          lastActionAt: Date.now(),
        }));
        return;
      }

      const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== "granted") {
        setState((current) => ({
          ...current,
          permission: "denied",
          backgroundPermission: backgroundPermission.status,
          backgroundCanAskAgain: backgroundPermission.canAskAgain,
          tracking: false,
          error: "background_permission_denied",
          lastActionAt: Date.now(),
        }));
        return;
      }

      const backgroundAvailable = await Location.isBackgroundLocationAvailableAsync();
      if (!backgroundAvailable) {
        setState((current) => ({
          ...current,
          permission: "granted",
          tracking: false,
          taskManagerAvailable: taskAvailable,
          backgroundAvailable: false,
          error: "background_location_unavailable",
          lastActionAt: Date.now(),
        }));
        return;
      }

      await environment.saveDriverContext(driverProfile);

      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      if (!alreadyStarted) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, BACKGROUND_OPTIONS);
      }

      const geofencesStarted = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK_NAME);
      if (!geofencesStarted) {
        await Location.startGeofencingAsync(GEOFENCING_TASK_NAME, toExpoGeofenceRegions());
      }

      const backendHealth = await environment.transport.checkHealth();

      setState((current) => ({
        ...current,
        permission: "granted",
        foregroundPermission: "granted",
        backgroundPermission: "granted",
        tracking: true,
        taskManagerAvailable: taskAvailable,
        backgroundAvailable: true,
        taskRegistered: true,
        geofencingTaskRegistered: true,
        readiness: evaluateTrackingReadiness({
          foregroundPermission: "granted",
          backgroundPermission: "granted",
          foregroundCanAskAgain: true,
          backgroundCanAskAgain: true,
          taskManagerAvailable: taskAvailable,
          backgroundAvailable: true,
          taskRegistered: true,
          geofencingTaskRegistered: true,
          backendOnline: backendHealth.online,
        }),
        error: null,
        lastActionAt: Date.now(),
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        tracking: false,
        error: error instanceof Error ? error.message : "background_tracking_start_failed",
        lastActionAt: Date.now(),
      }));
    }
  };

  const stopTracking = async () => {
    if (!environment) {
      return;
    }

    setState((current) => ({ ...current, error: null }));

    try {
      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      if (alreadyStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      }
      const geofencesStarted = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK_NAME);
      if (geofencesStarted) {
        await Location.stopGeofencingAsync(GEOFENCING_TASK_NAME);
      }

      setState((current) => ({
        ...current,
        tracking: false,
        taskRegistered: false,
        geofencingTaskRegistered: false,
        readiness: evaluateTrackingReadiness({
          foregroundPermission: current.foregroundPermission,
          backgroundPermission: current.backgroundPermission,
          foregroundCanAskAgain: current.foregroundCanAskAgain,
          backgroundCanAskAgain: current.backgroundCanAskAgain,
          taskManagerAvailable: current.taskManagerAvailable,
          backgroundAvailable: current.backgroundAvailable,
          taskRegistered: false,
          geofencingTaskRegistered: false,
          backendOnline: false,
        }),
        lastActionAt: Date.now(),
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "background_tracking_stop_failed",
        lastActionAt: Date.now(),
      }));
    }
  };

  return {
    state,
    refreshTrackingState,
    startTracking,
    stopTracking,
  };
}
