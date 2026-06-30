import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import * as api from "../services/api";
import {
  buildOperationalAlerts,
  mergeTelemetryEvent,
  summarizeFleet,
  type CriticalZoneAlert,
  type FleetSummary,
  type FleetVehicle,
  type Message,
  type MetricsSnapshot,
  type OperationalAlert,
  type SystemHealth,
  type TelemetryEvent,
  type VehicleDetail,
} from "../domain/fleet";

type AgentResponse = {
  answer?: {
    tool?: string;
    message?: string;
  } | string | null;
  reply?: string | null;
  conversationId?: string | null;
  turnIndex?: number | null;
  [key: string]: unknown;
};

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

function createConversationId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  return `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readReply(response: AgentResponse) {
  if (typeof response.reply === "string" && response.reply.trim()) {
    return response.reply.trim();
  }

  if (typeof response.answer === "string" && response.answer.trim()) {
    return response.answer.trim();
  }

  if (response.answer && typeof response.answer === "object" && "message" in response.answer) {
    const message = response.answer.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return "Pude consultar la flota, pero no encontre una respuesta legible.";
}

export function useFleetDashboard() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId] = useState(() => createConversationId());
  const [refreshInterval, setRefreshInterval] = useState(10000);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDetail | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [criticalAlerts, setCriticalAlerts] = useState<CriticalZoneAlert[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>("connecting");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const criticalAlertRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedVehicleIdRef = useRef<string | null>(null);

  const summary = useMemo<FleetSummary>(() => summarizeFleet(vehicles), [vehicles]);

  const operationalAlerts = useMemo<OperationalAlert[]>(
    () =>
      buildOperationalAlerts({
        health,
        summary,
        criticalAlerts,
        metrics,
      }),
    [criticalAlerts, health, metrics, summary]
  );

  const selectedVehicle = useMemo(() => {
    if (!vehicles.length) return null;
    return vehicles.find((vehicle) => vehicle.vehicle_id === selectedVehicleId) || vehicles[0];
  }, [selectedVehicleId, vehicles]);

  useEffect(() => {
    selectedVehicleIdRef.current = selectedVehicleId;
  }, [selectedVehicleId]);

  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      const [fleetStateResult, healthResult, metricsResult, criticalAlertsResult] = await Promise.allSettled([
        api.getFleetState(),
        api.getHealth(),
        api.getMetrics(),
        api.getCriticalZoneAlerts(20),
      ]);

      if (cancelled) return;

      startTransition(() => {
        const snapshotUpdated =
          fleetStateResult.status === "fulfilled" ||
          healthResult.status === "fulfilled" ||
          metricsResult.status === "fulfilled" ||
          criticalAlertsResult.status === "fulfilled";

        if (fleetStateResult.status === "fulfilled") {
          setVehicles(fleetStateResult.value.vehicles || []);
        }

        if (healthResult.status === "fulfilled") {
          setHealth(healthResult.value);
        }

        if (metricsResult.status === "fulfilled") {
          setMetrics(metricsResult.value);
        }

        if (criticalAlertsResult.status === "fulfilled") {
          setCriticalAlerts(criticalAlertsResult.value.vehicles || []);
        }

        if (snapshotUpdated) {
          setLastSyncAt(Date.now());
        }
      });
    };

    void loadSnapshot().catch((error) => {
      console.error("Error fetching dashboard snapshot:", error);
      if (!cancelled) {
        setConnectionStatus("error");
      }
    });

    const interval = setInterval(() => {
      void loadSnapshot().catch((error) => {
        console.error("Error refreshing dashboard snapshot:", error);
        if (!cancelled) {
          setConnectionStatus("error");
        }
      });
    }, refreshInterval);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshInterval, startTransition]);

  useEffect(() => {
    if (!vehicles.length) return;

    const selectedExists = selectedVehicleId
      ? vehicles.some((vehicle) => vehicle.vehicle_id === selectedVehicleId)
      : false;

    if (!selectedVehicleId || !selectedExists) {
      setSelectedVehicleId(vehicles[0].vehicle_id);
    }
  }, [selectedVehicleId, vehicles]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setVehicleDetail(null);
      return;
    }

    let cancelled = false;

    void api
      .getVehicleDetail(selectedVehicleId)
      .then((data) => {
        if (!cancelled) {
          setVehicleDetail(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching vehicle detail:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicleId]);

  useEffect(() => {
    let ws: WebSocket | null = null;

    const queueCriticalRefresh = () => {
      if (criticalAlertRefreshRef.current) {
        clearTimeout(criticalAlertRefreshRef.current);
      }

      criticalAlertRefreshRef.current = setTimeout(() => {
        void api
          .getCriticalZoneAlerts(20)
          .then((data) => setCriticalAlerts(data.vehicles || []))
          .catch((error) => {
            console.error("Failed to refresh critical zone alerts:", error);
          });
      }, 1200);
    };

    try {
      setConnectionStatus("connecting");
      ws = new WebSocket((process.env.NEXT_PUBLIC_WS_URL as string) || "ws://localhost:4001/ws");
      ws.onopen = () => setConnectionStatus("connected");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as
            | { type: "telemetry"; event: TelemetryEvent }
            | { type: "metrics"; metrics: MetricsSnapshot };

          if (msg.type === "telemetry" && msg.event) {
            startTransition(() => {
              setVehicles((prev) => mergeTelemetryEvent(prev, msg.event));
              setLastSyncAt(Date.now());
              if (selectedVehicleIdRef.current === msg.event.vehicle_id) {
                setVehicleDetail((current) =>
                  current
                    ? {
                        ...current,
                        lastEvent: msg.event,
                      }
                    : current
                );
              }
            });

            queueCriticalRefresh();
          }

          if (msg.type === "metrics") {
            startTransition(() => {
              setMetrics(msg.metrics);
            });
          }
        } catch (error) {
          console.warn("Invalid WS message:", error);
        }
      };
      ws.onerror = () => setConnectionStatus("error");
      ws.onclose = () => setConnectionStatus((current) => (current === "error" ? current : "disconnected"));
    } catch (error) {
      console.error("WS setup error:", error);
      setConnectionStatus("error");
    }

    return () => {
      if (criticalAlertRefreshRef.current) {
        clearTimeout(criticalAlertRefreshRef.current);
      }

      try {
        ws?.close();
      } catch {
        // no-op
      }
    };
  }, [startTransition]);

  const handleQueryAgent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!question.trim()) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setQuestion("");
    setLoading(true);

    try {
      const response = (await api.queryAgentWithContext(question, {
        conversationId,
      })) as AgentResponse;
      const replyText = readReply(response);

      setMessages((prev) => [...prev, { role: "assistant", content: replyText }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${(error as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return {
    vehicles,
    messages,
    conversationId,
    question,
    setQuestion,
    loading,
    refreshInterval,
    setRefreshInterval,
    health,
    metrics,
    summary,
    vehicleDetail,
    selectedVehicleId,
    setSelectedVehicleId,
    criticalAlerts,
    operationalAlerts,
    selectedVehicle,
    connectionStatus,
    lastSyncAt,
    isPending,
    handleQueryAgent,
  };
}
