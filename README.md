# @odigos/opentelemetry-node

Odigos distribution of OpenTelemetry for Node.js

This package is used in the odigos project to provide auto OpenTelemetry instrumentation for applications written in Node.js.

Note: This package is currently meant to be used in the odigos project with odigos OpAMP server. It cannot be used as a standalone package in arbitrary Node.js applications.

## GCP Pub/Sub auto-instrumentation

This distribution includes zero‑code‑change instrumentation for `@google-cloud/pubsub` that propagates W3C trace context and creates spans for both producers and consumers.

- Propagation: injects/extracts `traceparent` and `tracestate` via message `attributes`.
- Producer span: created around `Topic#publishMessage` (v2+) and legacy `Topic#publish`, and the internal `Publisher#publish` when present.
- Consumer span: created around user `subscription.on('message', listener)` handlers, with the parent set from the extracted remote context. The span ends on `ack()`/`nack()` or on the next microtask if neither is called synchronously.

Safety and compatibility:

- Works with `@google-cloud/pubsub` 2.x–5.x+ without breaking changes to user code.
- Never overwrites existing `traceparent`/`tracestate` attributes.
- Fully guarded with try/catch and idempotent wrapping. If anything fails, original behavior is preserved.

Environment toggles:

- `OTEL_PUBSUB_SPANS=0` — disable producer/consumer spans (propagation only).
- `OTEL_PUBSUB_PROPAGATION=0` — disable inject/extract entirely.

Disable via ODIGOS list:

Set `ODIGOS_DISABLED_INSTRUMENTATION_LIBRARIES` to include `@odigos/instrumentation-gcp-pubsub` (or the short form `gcp-pubsub`). Multiple values are comma‑separated.

Validation notes:

1. Ensure you publish and consume a message between two instrumented services using `@google-cloud/pubsub` 2.x–5.x.
2. Verify the producer span has `messaging.system=gcp_pubsub` and the consumer span shares the same trace ID (parent/child relation), with `messaging.operation=publish|process`.
3. Remove the instrumentation via the disable list and confirm app behavior remains unchanged.
