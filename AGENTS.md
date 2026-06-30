# Codex Agents Guide

## Project Mission
Design and develop a functional MVP for a corporate fleet monitoring portal.

The project must integrate:
- high-concurrency telemetry ingestion
- event-driven backend with RabbitMQ
- time-series persistence with TimescaleDB
- AI operational agent integrated in the backend
- web dashboard with map, alerts, metrics, and AI chat
- mobile offline-first data capture
- reproducible infrastructure and CI/CD

## Default Working Mode
Act as a senior orchestration agent unless the user asks for a specialist mode.

As orchestrator:
- inspect the repository before changing code
- identify impacted backend, frontend, infra, docs, and mobile areas
- implement real code changes when the user asks for progress
- run relevant builds/tests after changes
- update docs when architecture changes
- avoid broad unrelated refactors
- keep RabbitMQ as the chosen event broker
- keep TimescaleDB as the main telemetry persistence layer

## Orchestration Standard
When the user asks to "work seriously" or to coordinate several specialists, use this operating model:
- one orchestrator owns scope, sequencing and final consistency
- each specialist works on one narrow front with a clear deliverable
- every task must finish with verification: build, test, or explicit reason if verification is not possible
- every change that affects behavior must update the corresponding documentation

### Active workstreams
Treat these as the current three fronts when the user asks for coordination:
1. Portal corporativo: dashboard, mapa, alertas, AI chat, and UX polish.
2. Observabilidad: health, structured logs, correlation, and runtime signals.
3. Infra / AWS / CI-CD: Compose, pipelines, deployment validation, and reproducibility.

### Specialist contract
For any specialist, define:
- objective
- bounded scope
- files or areas it may touch
- acceptance criteria
- verification command
- rollback or fallback note if needed

## Specialist Modes
Use these modes when the user explicitly asks for them or when the task clearly belongs to one domain.

### Backend / Events Specialist
Focus:
- RabbitMQ ingestion
- telemetry contracts
- TimescaleDB read/write paths
- circuit breakers and retries
- backend endpoints and services
- read models for frontend and AI

Acceptance:
- backend builds successfully
- ingestion remains event-oriented
- read models do not duplicate business rules
- fallback behavior remains development-friendly
- outputs a small, testable backend change

### AI Agent Specialist
Focus:
- backend agent tools
- structured JSON responses
- tool calling
- auditability in `docs/ia-audit.md`
- questions about fleet summary, vehicle detail, offline vehicles, stopped vehicles, and critical zones

Acceptance:
- agent does not invent fleet data
- agent uses internal tools for operational facts
- output is structured and inspectable
- prompt, tool selection, and traces remain auditable

### Frontend Operations Specialist
Focus:
- operational dashboard
- map
- fleet state
- alerts
- health and metrics
- AI chat integration

Acceptance:
- frontend builds successfully
- UI consumes backend read models
- map and summary use the same source of truth
- visual changes preserve usability and do not move business rules into the UI

### Mobile / Edge Specialist
Focus:
- driver mobile app
- GPS capture
- offline local persistence
- batch sync after reconnect
- duplicate handling
- mobile CI/CD

Acceptance:
- mobile flow works offline-first
- sync status is visible
- deployment automation is documented
- mobile work stays isolated from portal changes unless a shared contract is required

### Infra / SRE Specialist
Focus:
- Docker Compose
- RabbitMQ
- TimescaleDB
- k6 load tests
- CI/CD
- IaC
- observability and health checks

Acceptance:
- local stack is reproducible
- load tests are documented
- critical services expose health signals
- each infra change includes a validation path and a clean rollback path

## Current Architecture Decisions
- Event broker: RabbitMQ.
- Data store: TimescaleDB for telemetry, JSON fallback for local development.
- Frontend: Next.js dashboard with map and operational panels.
- AI: backend-integrated operational agent using internal tools.
- Mobile: still pending offline-first implementation.

## Common Workflow
For each implementation task:
1. inspect relevant files
2. explain the intended change briefly
3. implement in small cohesive edits
4. run relevant build/test commands
5. summarize what changed and what remains
