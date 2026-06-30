const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4001/api";

export async function getFleetState() {
  const res = await fetch(`${API_BASE}/telemetry/state`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch fleet state: ${res.status}`);
  return res.json();
}

export async function getFleetSummary() {
  const res = await fetch(`${API_BASE}/telemetry/summary`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch fleet summary: ${res.status}`);
  return res.json();
}

export async function getVehicleDetail(vehicleId: string) {
  const res = await fetch(`${API_BASE}/telemetry/vehicle/${vehicleId}/detail`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch vehicle detail: ${res.status}`);
  return res.json();
}

export async function getCriticalZoneAlerts(minMinutes = 20) {
  const res = await fetch(`${API_BASE}/telemetry/critical-zones/stopped?minMinutes=${minMinutes}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch critical zone alerts: ${res.status}`);
  return res.json();
}

export async function getHealth() {
  const res = await fetch(`${API_BASE.replace(/\/api$/, "")}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch health: ${res.status}`);
  return res.json();
}

export async function getMetrics() {
  const res = await fetch(`${API_BASE.replace(/\/api$/, "")}/metrics`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch metrics: ${res.status}`);
  return res.json();
}

export async function sendTelemetryEvent(payload: any) {
  const res = await fetch(`${API_BASE}/telemetry/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to send event: ${res.status}`);
  return res.json();
}

export async function queryAgent(question: string) {
  return queryAgentWithContext(question);
}

export async function queryAgentWithContext(
  question: string,
  options: {
    conversationId?: string | null;
    specialist?: string | null;
  } = {}
) {
  const res = await fetch(`${API_BASE}/agent/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      conversationId: options.conversationId,
      specialist: options.specialist,
    }),
  });
  if (!res.ok) throw new Error(`Failed to query agent: ${res.status}`);
  return res.json();
}
