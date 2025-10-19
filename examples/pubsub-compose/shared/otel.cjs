const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { W3CTraceContextPropagator, W3CBaggagePropagator, CompositePropagator } = require('@opentelemetry/core');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Enable loading TypeScript sources without a build step
require('ts-node/register/transpile-only');
const { PubSubInstrumentation } = require('../src/instrumentations/pubsub-instrumentation.ts');

const exporter = new OTLPTraceExporter({ url: 'http://otel-collector:4318/v1/traces' });

const sdk = new NodeSDK({
  resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || 'app' }),
  traceExporter: exporter,
  textMapPropagator: new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  }),
  instrumentations: [ new PubSubInstrumentation() ],
});

try {
  sdk.start();
} catch (err) {
  console.error('OpenTelemetry SDK start failed', err);
}

process.on('SIGTERM', () => sdk.shutdown());

