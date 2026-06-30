import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ReactNode } from "react";
import type { MobileEnvironment } from "../app/createMobileEnvironment";
import type { DriverTelemetryEvent, SyncBatchSummary, SyncHealth } from "../contracts/telemetry";
import { createDefaultDriverContext, type DriverContext } from "../storage/sqliteDriverContext";
import { useBackgroundDriverTracking } from "../hooks/useBackgroundDriverTracking";
import { GEO_FENCE_TASK_REGIONS } from "../storage/geofenceZones";

type SyncStatusScreenProps = {
  environment: MobileEnvironment;
};

type ScreenState = {
  queue: DriverTelemetryEvent[];
  health: SyncHealth | null;
  backendOnline: boolean;
  backendStatus: string | null;
  backendBroker: string | null;
  backendDatabase: string | null;
  lastBatchSummary: SyncBatchSummary | null;
  loading: boolean;
  syncing: boolean;
  profileLoading: boolean;
  profileSaving: boolean;
  error: string | null;
};

function formatDate(timestamp: number | null) {
  if (!timestamp) {
    return "sin sincronizar";
  }

  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export function SyncStatusScreen({ environment }: SyncStatusScreenProps) {
  const tracking = useBackgroundDriverTracking(environment);
  const [driverProfile, setDriverProfile] = useState<DriverContext>(createDefaultDriverContext());
  const [state, setState] = useState<ScreenState>({
    queue: [],
    health: null,
    backendOnline: false,
    backendStatus: null,
    backendBroker: null,
    backendDatabase: null,
    lastBatchSummary: null,
    loading: true,
    syncing: false,
    profileLoading: true,
    profileSaving: false,
    error: null,
  });

  const refresh = async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const [queue, backendHealth] = await Promise.all([
        environment.queueStore.list(),
        environment.transport.checkHealth(),
      ]);
      const health = await environment.syncService.getHealth(backendHealth.online);

      setState((current) => ({
        ...current,
        queue,
        health,
        backendOnline: backendHealth.online,
        backendStatus: backendHealth.status,
        backendBroker: backendHealth.broker,
        backendDatabase: backendHealth.database,
        lastBatchSummary: current.lastBatchSummary,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "sync_status_error",
      }));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setState((current) => ({ ...current, profileLoading: true }));

      try {
        const context = await environment.loadDriverContext();
        if (!cancelled) {
          setDriverProfile(context);
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "driver_profile_load_error",
          }));
        }
      } finally {
        if (!cancelled) {
          setState((current) => ({ ...current, profileLoading: false }));
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [environment]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 4000);

    return () => clearInterval(interval);
  }, [environment]);

  const pendingQueue = useMemo(
    () => state.queue.filter((event) => event.syncStatus !== "synced"),
    [state.queue],
  );

  const latestFix = useMemo(() => state.queue[state.queue.length - 1] ?? null, [state.queue]);

  const handleSaveProfile = async () => {
    setState((current) => ({ ...current, profileSaving: true, error: null }));

    try {
      const saved = await environment.saveDriverContext(driverProfile);
      setDriverProfile(saved);
      await refresh();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "driver_profile_save_error",
      }));
    } finally {
      setState((current) => ({ ...current, profileSaving: false }));
    }
  };

  const handleStartTracking = async () => {
    setState((current) => ({ ...current, error: null }));
    await tracking.startTracking(driverProfile);
    await refresh();
  };

  const handleStopTracking = async () => {
    setState((current) => ({ ...current, error: null }));
    await tracking.stopTracking();
    await refresh();
  };

  const handleAddDemoEvent = async () => {
    setState((current) => ({ ...current, error: null }));

    try {
      await environment.addDemoEvent();
      await refresh();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "demo_event_error",
      }));
    }
  };

  const handleAddDemoRoute = async () => {
    setState((current) => ({ ...current, error: null }));

    try {
      await environment.addDemoRoute(driverProfile.vehicleId);
      await refresh();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "demo_route_error",
      }));
    }
  };

  const handleSyncNow = async () => {
    setState((current) => ({ ...current, syncing: true, error: null }));

    try {
      const result = await environment.syncService.flush(8);
      setState((current) => ({
        ...current,
        lastBatchSummary: result.summary,
      }));
      await refresh();
    } catch (error) {
      setState((current) => ({
        ...current,
        syncing: false,
        error: error instanceof Error ? error.message : "sync_error",
      }));
      return;
    }

    setState((current) => ({ ...current, syncing: false }));
  };

  const health = state.health;

  return (
    <ScrollView testID="sync-status-screen" contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Fleet Driver</Text>
        <Text style={styles.title}>Panel operativo móvil</Text>
        <Text style={styles.subtitle}>
          Background tracking, cola SQLite y sincronización automática contra el backend.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard label="Pendientes" value={String(health?.pendingEvents ?? pendingQueue.length)} />
        <SummaryCard label="Fallidos" value={String(health?.failedEvents ?? 0)} />
        <SummaryCard label="Ult. sync" value={formatDate(health?.lastSyncAt ?? null)} />
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Datos del conductor</Text>
            <Text style={styles.panelSubtitle}>
              El task lee este perfil desde SQLite para asociar los fixes al vehículo correcto.
            </Text>
          </View>
          {state.profileLoading ? <ActivityIndicator /> : null}
        </View>

        <View style={styles.formGrid}>
          <Field label="Conductor">
            <TextInput
              value={driverProfile.driverName}
              onChangeText={(value) => setDriverProfile((current) => ({ ...current, driverName: value }))}
              placeholder="Nombre del conductor"
              style={styles.input}
              testID="driver-name-input"
            />
          </Field>
          <Field label="Vehiculo">
            <TextInput
              value={driverProfile.vehicleId}
              onChangeText={(value) => setDriverProfile((current) => ({ ...current, vehicleId: value }))}
              placeholder="veh-mobile-1"
              style={styles.input}
              autoCapitalize="none"
              testID="vehicle-id-input"
            />
          </Field>
          <Field label="Ruta">
            <TextInput
              value={driverProfile.routeId}
              onChangeText={(value) => setDriverProfile((current) => ({ ...current, routeId: value }))}
              placeholder="route-demo"
              style={styles.input}
              autoCapitalize="none"
              testID="route-id-input"
            />
          </Field>
        </View>

        <View style={styles.actionsRow}>
          <ActionButton
            label="Guardar conductor"
            onPress={handleSaveProfile}
            disabled={state.profileSaving}
            testID="save-driver-button"
          />
          <ActionButton label="Iniciar tracking" onPress={handleStartTracking} testID="start-tracking-button" />
          <ActionButton
            label="Detener tracking"
            onPress={handleStopTracking}
            variant="secondary"
            testID="stop-tracking-button"
          />
        </View>

        {tracking.state.error ? <Text style={styles.errorText}>{tracking.state.error}</Text> : null}

        <View style={styles.healthRow}>
          <Pill
            label="Readiness"
            value={tracking.state.readiness.status}
            tone={tracking.state.readiness.status === "ready" ? "success" : "warning"}
          />
          <Pill
            label="Foreground"
            value={tracking.state.foregroundPermission}
            tone={tracking.state.foregroundPermission === "granted" ? "success" : "warning"}
          />
          <Pill
            label="Background perm"
            value={tracking.state.backgroundPermission}
            tone={tracking.state.backgroundPermission === "granted" ? "success" : "warning"}
          />
          <Pill
            label="Permiso"
            value={tracking.state.permission}
            tone={tracking.state.permission === "granted" ? "success" : "warning"}
          />
          <Pill
            label="Tracking"
            value={tracking.state.tracking ? "Activo" : "Inactivo"}
            tone={tracking.state.tracking ? "success" : "warning"}
          />
          <Pill
            label="Background"
            value={tracking.state.backgroundAvailable ? "Disponible" : "No disponible"}
            tone={tracking.state.backgroundAvailable ? "success" : "warning"}
          />
          <Pill
            label="Task manager"
            value={tracking.state.taskManagerAvailable ? "Disponible" : "No disponible"}
            tone={tracking.state.taskManagerAvailable ? "success" : "warning"}
          />
          <Pill label="Task" value={tracking.state.taskRegistered ? "Registrado" : "No registrado"} />
          <Pill
            label="Geofence"
            value={tracking.state.geofencingTaskRegistered ? "Activo" : "Inactivo"}
            tone={tracking.state.geofencingTaskRegistered ? "success" : "warning"}
          />
        </View>
        <View style={styles.checklist}>
          {tracking.state.readiness.checklist.map((item) => (
            <View key={item.key} style={styles.checklistItem}>
              <Text style={[styles.checklistMark, item.ok ? styles.checklistMarkOk : styles.checklistMarkFail]}>
                {item.ok ? "OK" : "NO"}
              </Text>
              <View style={styles.checklistTextBlock}>
                <Text style={styles.checklistLabel}>{item.label}</Text>
                <Text style={styles.checklistDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
        {tracking.state.readiness.blockers.length > 0 ? (
          <Text style={styles.errorText}>Bloqueos: {tracking.state.readiness.blockers.join(", ")}</Text>
        ) : null}
        {tracking.state.readiness.warnings.length > 0 ? (
          <Text style={styles.helperText}>Warnings: {tracking.state.readiness.warnings.join(", ")}</Text>
        ) : null}
        <Text style={styles.helperText}>
          Última acción: {formatDate(tracking.state.lastActionAt)}
        </Text>
        <Text style={styles.helperText}>
          Zonas operativas: {GEO_FENCE_TASK_REGIONS.length}
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Captura GPS</Text>
            <Text style={styles.panelSubtitle}>
              El último fix de la cola te muestra qué está capturando el background task.
            </Text>
          </View>
          <View style={styles.routeActions}>
            <ActionButton
              label="Agregar demo"
              onPress={handleAddDemoEvent}
              variant="ghost"
              testID="add-demo-event-button"
            />
            <ActionButton
              label="Ruta fija"
              onPress={handleAddDemoRoute}
              variant="secondary"
              testID="add-demo-route-button"
            />
          </View>
        </View>

        {latestFix ? (
          <View style={styles.fixCard}>
            <Text style={styles.fixTitle}>Ultimo fix</Text>
            <Text style={styles.fixText}>
              {latestFix.latitude.toFixed(5)}, {latestFix.longitude.toFixed(5)}
            </Text>
            <Text style={styles.fixText}>Velocidad: {latestFix.speed.toFixed(1)} km/h</Text>
            <Text style={styles.fixText}>
              Estado: {latestFix.status} | {formatDate(latestFix.timestamp)}
            </Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>Esperando la primera posicion GPS.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Cola offline</Text>
            <Text style={styles.panelSubtitle}>
              SQLite almacena los eventos mientras el fondo los captura.
            </Text>
          </View>
          {state.loading ? <ActivityIndicator /> : null}
        </View>

        <View style={styles.actionsRow}>
          <ActionButton
            label={state.syncing ? "Sincronizando..." : "Sincronizar"}
            onPress={handleSyncNow}
            disabled={state.syncing}
            testID="sync-button"
          />
          <ActionButton label="Recargar" onPress={refresh} variant="secondary" testID="refresh-button" />
        </View>

        {state.error ? <Text style={styles.errorText}>{state.error}</Text> : null}

        <View style={styles.healthRow}>
          <Pill label="Base" value={health ? "SQLite" : "Inicializando"} />
          <Pill
            label="Estado"
            value={state.backendOnline ? "Conectado" : "Desconectado"}
            tone={state.backendOnline ? "success" : "warning"}
          />
          <Pill label="Broker" value={state.backendBroker ?? "sin dato"} />
          <Pill label="DB" value={state.backendDatabase ?? "sin dato"} />
          <Pill label="Eventos" value={`${state.queue.length}`} />
        </View>
        {state.backendStatus ? <Text style={styles.backendStatus}>Backend: {state.backendStatus}</Text> : null}

        {state.lastBatchSummary ? (
          <View style={styles.batchSummaryCard}>
            <Text style={styles.fixTitle}>Ultimo lote</Text>
            <Text style={styles.fixText}>
              Lotes: {state.lastBatchSummary.batchCount} | Tamaño: {state.lastBatchSummary.batchSize}
            </Text>
            <Text style={styles.fixText}>
              Aceptados: {state.lastBatchSummary.accepted} | Rechazados: {state.lastBatchSummary.rejected}
            </Text>
            <View style={styles.batchDetailList}>
              {state.lastBatchSummary.details.map((detail) => (
                <Text key={detail.index} style={styles.batchDetail}>
                  Lote {detail.index}: {detail.size} eventos, {detail.accepted} aceptados, {detail.rejected} rechazados
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        <FlatList
          data={state.queue}
          keyExtractor={(item) => item.eventId}
          scrollEnabled={false}
          renderItem={({ item }) => <QueueItem event={item} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Todavia no hay eventos en la cola local.</Text>
          }
        />
      </View>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function Pill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <View style={[styles.pill, tone === "success" && styles.pillSuccess, tone === "warning" && styles.pillWarning]}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
  testID,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  testID?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        void onPress();
      }}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "secondary" && styles.actionButtonSecondary,
        variant === "ghost" && styles.actionButtonGhost,
        pressed && !disabled && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant !== "primary" && styles.actionButtonTextDark,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QueueItem({ event }: { event: DriverTelemetryEvent }) {
  return (
    <View style={styles.queueItem}>
      <View style={styles.queueItemTop}>
        <Text style={styles.queueItemId}>{event.vehicle_id}</Text>
        <Text style={styles.queueItemStatus}>{event.syncStatus}</Text>
      </View>
      <Text style={styles.queueItemMeta}>
        {event.speed} km/h - {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
      </Text>
      <Text style={styles.queueItemMeta}>eventId: {event.eventId}</Text>
      <Text style={styles.queueItemMeta}>retry: {event.retryCount}</Text>
      {event.lastError ? <Text style={styles.queueItemError}>{event.lastError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 18,
    backgroundColor: "#f2f4f7",
  },
  hero: {
    backgroundColor: "#182230",
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  kicker: {
    color: "#d8b17d",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  subtitle: {
    color: "#d7dde7",
    fontSize: 14,
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e6e8ee",
  },
  summaryLabel: {
    color: "#7b8496",
    fontSize: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryValue: {
    color: "#182230",
    fontSize: 18,
    fontWeight: "700",
  },
  panel: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#e7e9ef",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  panelTitle: {
    color: "#182230",
    fontSize: 20,
    fontWeight: "800",
  },
  panelSubtitle: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  formGrid: {
    gap: 12,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderColor: "#d0d5dd",
    borderRadius: 14,
    borderWidth: 1,
    color: "#182230",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  routeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
  },
  actionButton: {
    backgroundColor: "#8c5a2b",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionButtonSecondary: {
    backgroundColor: "#eef2f6",
  },
  actionButtonGhost: {
    backgroundColor: "#f6eadc",
  },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  actionButtonTextDark: {
    color: "#182230",
  },
  errorText: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "600",
  },
  helperText: {
    color: "#667085",
    fontSize: 12,
    marginTop: -4,
  },
  healthRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f5f7fa",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pillSuccess: {
    backgroundColor: "#e7f7ee",
  },
  pillWarning: {
    backgroundColor: "#fff5e7",
  },
  pillLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  pillValue: {
    color: "#182230",
    fontSize: 13,
    fontWeight: "700",
  },
  checklist: {
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checklistMark: {
    width: 34,
    color: "#ffffff",
    borderRadius: 8,
    overflow: "hidden",
    paddingVertical: 4,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
  },
  checklistMarkOk: {
    backgroundColor: "#027a48",
  },
  checklistMarkFail: {
    backgroundColor: "#b42318",
  },
  checklistTextBlock: {
    flex: 1,
  },
  checklistLabel: {
    color: "#182230",
    fontSize: 13,
    fontWeight: "800",
  },
  checklistDetail: {
    color: "#667085",
    fontSize: 12,
  },
  fixCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 4,
  },
  fixTitle: {
    color: "#182230",
    fontWeight: "800",
    fontSize: 14,
  },
  fixText: {
    color: "#667085",
    fontSize: 13,
  },
  batchSummaryCard: {
    backgroundColor: "#f3f7ff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7e3ff",
    padding: 14,
    gap: 4,
  },
  batchDetailList: {
    gap: 4,
    marginTop: 4,
  },
  batchDetail: {
    color: "#4b5565",
    fontSize: 12,
  },
  backendStatus: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyText: {
    color: "#667085",
    fontSize: 14,
    paddingVertical: 12,
  },
  queueItem: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#eaecf0",
    gap: 4,
  },
  queueItemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  queueItemId: {
    color: "#182230",
    fontSize: 16,
    fontWeight: "800",
  },
  queueItemStatus: {
    color: "#8c5a2b",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  queueItemMeta: {
    color: "#667085",
    fontSize: 12,
  },
  queueItemError: {
    color: "#b42318",
    fontSize: 12,
    fontWeight: "600",
  },
});
