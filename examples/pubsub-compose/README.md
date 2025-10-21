# Pub/Sub emulator demo

This example spins up:

- Google Pub/Sub emulator
- Producer and consumer Node apps auto-instrumented with Odigos Pub/Sub instrumentation
- OpenTelemetry Collector exporting traces to Jaeger UI

## Run

From the repo root:

```
docker compose -f examples/pubsub-compose/docker-compose.yml up --build
```

Open Jaeger UI at http://localhost:16686 and search for the `producer` or `consumer` services.

Producer exposes `POST http://localhost:8081/publish` to publish arbitrary JSON payloads.

## Notes

- Emulator runs at `pubsub:8085`; apps connect using `PUBSUB_EMULATOR_HOST`.
- Instrumentation is zero-code-change for propagation; producer/consumer spans enabled by default.
- To disable spans set `OTEL_PUBSUB_SPANS=0` in the service env. To disable propagation set `OTEL_PUBSUB_PROPAGATION=0`.

