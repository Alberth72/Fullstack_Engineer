import { randomBytes } from "crypto";
import { trace as otelTrace } from "@opentelemetry/api";

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  requestId: string;
  sampled: boolean;
};

type IncomingTraceHeaders = {
  traceparent?: string | null;
  xTraceId?: string | null;
  xSpanId?: string | null;
  xParentSpanId?: string | null;
};

function randomHex(bytes: number) {
  return randomBytes(bytes).toString("hex");
}

function isHex(value: string, length: number) {
  return new RegExp(`^[a-f0-9]{${length}}$`).test(value);
}

function normalizeTraceId(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && isHex(normalized, 32) ? normalized : null;
}

function normalizeSpanId(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && isHex(normalized, 16) ? normalized : null;
}

export function parseTraceparent(value?: string | null) {
  const parts = value?.trim().split("-") ?? [];
  if (parts.length !== 4) return null;

  const [version, traceId, spanId, flags] = parts;
  if (version !== "00") return null;

  const normalizedTraceId = normalizeTraceId(traceId);
  const normalizedSpanId = normalizeSpanId(spanId);
  if (!normalizedTraceId || !normalizedSpanId || !/^[a-f0-9]{2}$/.test(flags ?? "")) {
    return null;
  }

  return {
    traceId: normalizedTraceId,
    parentSpanId: normalizedSpanId,
    sampled: (parseInt(flags!, 16) & 1) === 1,
  };
}

export function createTraceContext(requestId: string, headers: IncomingTraceHeaders = {}) {
  const traceparent = parseTraceparent(headers.traceparent);
  const activeSpanContext = otelTrace.getActiveSpan()?.spanContext();
  const activeTraceId = activeSpanContext ? normalizeTraceId(activeSpanContext.traceId) : null;
  const activeSpanId = activeSpanContext ? normalizeSpanId(activeSpanContext.spanId) : null;
  const traceId =
    traceparent?.traceId ?? normalizeTraceId(headers.xTraceId) ?? activeTraceId ?? randomHex(16);
  const parentSpanId =
    traceparent?.parentSpanId ??
    normalizeSpanId(headers.xParentSpanId) ??
    normalizeSpanId(headers.xSpanId) ??
    activeSpanId;

  return {
    traceId,
    spanId: randomHex(8),
    parentSpanId,
    requestId,
    sampled: traceparent?.sampled ?? (activeSpanContext ? (activeSpanContext.traceFlags & 1) === 1 : true),
  } satisfies TraceContext;
}

export function createChildTraceContext(parent: TraceContext, requestId = parent.requestId) {
  return {
    traceId: parent.traceId,
    spanId: randomHex(8),
    parentSpanId: parent.spanId,
    requestId,
    sampled: parent.sampled,
  } satisfies TraceContext;
}

export function serializeTraceparent(trace: TraceContext) {
  return `00-${trace.traceId}-${trace.spanId}-${trace.sampled ? "01" : "00"}`;
}

export function traceHeaders(trace: TraceContext) {
  return {
    traceparent: serializeTraceparent(trace),
    "X-Trace-Id": trace.traceId,
    "X-Span-Id": trace.spanId,
    "X-Parent-Span-Id": trace.parentSpanId ?? "",
    "X-Request-Id": trace.requestId,
  };
}

export function traceLogContext(trace?: TraceContext | null) {
  if (!trace) return {};

  return {
    traceId: trace.traceId,
    spanId: trace.spanId,
    parentSpanId: trace.parentSpanId,
    requestId: trace.requestId,
  };
}
