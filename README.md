# @odigos/opentelemetry-node

Odigos distribution of OpenTelemetry for Node.js

This package is used in the odigos project to provide auto OpenTelemetry instrumentation for applications written in Node.js.

Note: This package is currently meant to be used in the odigos project with odigos OpAMP server. It cannot be used as a standalone package in arbitrary Node.js applications.

Validation notes:

1. Ensure you publish and consume a message between two instrumented services using `@google-cloud/pubsub` 2.x–5.x.
2. Verify the producer span has `messaging.system=gcp_pubsub` and the consumer span shares the same trace ID (parent/child relation), with `messaging.operation=publish|process`.
3. Remove the instrumentation via the disable list and confirm app behavior remains unchanged.
