import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { W3CTraceContextPropagator, W3CBaggagePropagator } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Enable loading TypeScript sources without a build step
require('ts-node/register/transpile-only');
const { PubSubInstrumentation } = require('../src/instrumentations/pubsub-instrumentation.ts');

const exporter = new OTLPTraceExporter({ url: 'http://otel-collector:4318/v1/traces' });

const sdk = new NodeSDK({
  resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || 'app' }),
  traceExporter: exporter,
  textMapPropagator: {
    inject: (ctx, carrier, setter) => {
      new W3CTraceContextPropagator().inject(ctx, carrier, setter);
      new W3CBaggagePropagator().inject(ctx, carrier, setter);
    },
    extract: (ctx, carrier, getter) => {
      const withTrace = new W3CTraceContextPropagator().extract(ctx, carrier, getter);
      return new W3CBaggagePropagator().extract(withTrace, carrier, getter);
    },
    fields: () => {
      const a = new W3CTraceContextPropagator().fields();
      const b = new W3CBaggagePropagator().fields();
      return Array.from(new Set([...a, ...b]));
    }
  },
  instrumentations: [ new PubSubInstrumentation() ],
});

sdk.configureTracerProvider();
await sdk.start();

process.on('SIGTERM', () => sdk.shutdown());

