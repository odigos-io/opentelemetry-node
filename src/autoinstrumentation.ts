// set the diag logger for OpenTelemetry first thing, to make sure we log everything related
require('./diag').setOtelDiagLoggerToConsole();

import { diag, Span, TracerProvider } from "@opentelemetry/api";
diag.info("Starting Odigos OpenTelemetry auto-instrumentation agent");

import { uuidv7 } from "uuidv7";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OpAMPClientHttp, RemoteConfig, SdkHealthStatus } from "./opamp";
import {
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_DISTRO_VERSION,
  ATTR_TELEMETRY_DISTRO_NAME,
} from "@opentelemetry/semantic-conventions/incubating";
import {
  envDetector,
  hostDetector,
  resourceFromAttributes,
  detectResources,
} from "@opentelemetry/resources";
import {
  AsyncLocalStorageContextManager,
} from "@opentelemetry/context-async-hooks";
import { context, propagation } from "@opentelemetry/api";
import { VERSION } from "./version";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  SpanProcessor,
  ParentBasedSampler,
  Sampler,
} from "@opentelemetry/sdk-trace-node";
import { OdigosProcessDetector, PROCESS_VPID } from "./OdigosProcessDetector";
import { idGeneratorFromConfig } from "./id-generator";
import { OdigosHeadSampler } from "./sampler";
import { PubSubMessageHookInfo } from "./instrumentations/googlepubsub/types";
import { InstrumentationLibraryConfigFunction } from "./instrumentations/config";

const serviceInstanceId = uuidv7();

export interface InstrumentationLibrariesTracerProviderSetter {
  setTracerProvider(tracerProvider: TracerProvider): void;
}

// used by native-community agent
export const createNativeCommunitySpanProcessor = (): SpanProcessor => {
  return new BatchSpanProcessor(new OTLPTraceExporter());
}

// this function is meant to be called by the specific agent implementation.
// it allows the agent to provide its own span processor, depending on the
// agent implementation (for example - eBPF span processor for enterprise agent)
export const startOpenTelemetryAgent = (distroName: string, opampServerHost: string, spanProcessor: SpanProcessor, additionalConfigs: Record<string, InstrumentationLibraryConfigFunction> | undefined): InstrumentationLibrariesTracerProviderSetter | undefined => {
  if (!opampServerHost) {
    diag.error(
      "Missing required environment variables ODIGOS_OPAMP_SERVER_HOST"
    );
    return undefined;
  }

  const staticResource = resourceFromAttributes({
    [ATTR_TELEMETRY_DISTRO_NAME]: distroName,
    [ATTR_TELEMETRY_DISTRO_VERSION]: VERSION,
    [ATTR_SERVICE_INSTANCE_ID]: serviceInstanceId,
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "nodejs",
  });

  const detectorsResource = detectResources({
    detectors: [
      // env detector reads resource attributes from the environment.
      // we don't populate it at the moment, but if the user set anything, this detector will pick it up
      envDetector,
      // info about executable, runtime, command, etc
      new OdigosProcessDetector(),
      // host name, and arch
      hostDetector,
    ],
  });

  const resource = staticResource.merge(detectorsResource);

  const agentDescriptionIdentifyingAttributes = resource.attributes;

  // context manager
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  // propagator
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });
  propagation.setGlobalPropagator(propagator);

  const { InstrumentationLibraries } = require("./instrumentations");
  // instrumentation libraries
  const instrumentationLibraries = new InstrumentationLibraries(additionalConfigs);

  const opampClient = new OpAMPClientHttp({
    serviceInstanceId,
    opAMPServerHost: opampServerHost,
    agentDescriptionIdentifyingAttributes,
    agentDescriptionNonIdentifyingAttributes: {},
    onNewRemoteConfig: (remoteConfig: RemoteConfig) => {

      // set the tracer provider based on if traces are enabled or not.
      let tracerProvider: TracerProvider | undefined;
      if (remoteConfig.containerConfig.traces) {
        const idGeneratorConfig = remoteConfig.containerConfig.traces?.idGenerator;
        const idGenerator = idGeneratorFromConfig(idGeneratorConfig);

        var sampler: Sampler | undefined = undefined;
        // const headSamplingConfig = remoteConfig.containerConfig?.traces?.headSampling;
        // if (headSamplingConfig) {
        //   sampler = new ParentBasedSampler({
        //     root: new OdigosHeadSampler(headSamplingConfig),
        //   });
        // }

        const nodeTracerProvider = new NodeTracerProvider({
          sampler,
          resource,
          idGenerator,
          spanProcessors: [spanProcessor],
        });
        tracerProvider = nodeTracerProvider;
      }

      instrumentationLibraries.updateConfig(remoteConfig, tracerProvider);
      opampClient.setSdkHealthy();
    },
    initialPackageStatues: [], // TODO: fill this up
  });

  opampClient.start();

  const shutdown = async (shutdownReason: string) => {
    try {
      diag.info("Shutting down OpenTelemetry SDK and OpAMP client");
      await Promise.all([
        opampClient.shutdown(shutdownReason),
        spanProcessor.shutdown(),
      ]);
    } catch (err) {
      diag.error("Error shutting down OpenTelemetry SDK and OpAMP client", err);
    }
  };

  process.on("SIGTERM", () => shutdown("runtime received SIGTERM"));
  process.on("SIGINT", () => shutdown("runtime received SIGINT"));
  // exit will be called when:
  // - explicit exit - the process.exit() method is called explicitly
  // - normal exit - the Node.js event loop has no additional work to perform
  // - fatal error - an uncaught exception is thrown and not handled by application code
  process.on("exit", () => shutdown("node.js runtime is exiting"));

  return instrumentationLibraries;
}
