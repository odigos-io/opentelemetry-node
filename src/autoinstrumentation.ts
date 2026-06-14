import { TracerProvider } from "@opentelemetry/api";
import type { OdigosDiagLogger } from "./diag/OdigosDiag";

export { createOdigosDiag } from "./diag";

import { uuidv7 } from "uuidv7";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OpAMPClientHttp, RemoteConfig } from "./opamp";
import {
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_DISTRO_VERSION,
  ATTR_TELEMETRY_DISTRO_NAME,
} from "@opentelemetry/semantic-conventions/incubating";
import {
  hostDetector,
  resourceFromAttributes,
  detectResources,
} from "@opentelemetry/resources";
import { odigosEnvDetector } from "./OdigosEnvDetector";
import {
  AsyncLocalStorageContextManager,
} from "@opentelemetry/context-async-hooks";
import { context, propagation } from "@opentelemetry/api";
import { VERSION } from "./version";
import {
  BatchSpanProcessor,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { OdigosNodeTracerProvider } from "./OdigosNodeTracerProvider";
import { OdigosProcessDetector, PROCESS_VPID } from "./OdigosProcessDetector";
import { idGeneratorFromConfig } from "./id-generator";
import { InstrumentationLibraryConfigFunction } from "./instrumentations/config";
import { createAndRegisterOtelDiag } from "./diag";

const serviceInstanceId = uuidv7();

export interface InstrumentationLibrariesTracerProviderSetter {
  setTracerProvider(tracerProvider: TracerProvider): void;
}

// used by native-community agent
export const createNativeCommunitySpanProcessor = (): SpanProcessor => {
  return new BatchSpanProcessor(new OTLPTraceExporter());
}

export interface StartOpenTelemetryAgentOptions {
  distroName: string;
  opampServerHost: string;
  spanProcessorExporting: SpanProcessor;
  additionalConfigs?: Record<string, InstrumentationLibraryConfigFunction>;
  logger: OdigosDiagLogger;

  // this option is used by the distro (community or enterprise) to get notified
  // when the remote config is updated, and allows the distro to update additional components
  // (like the processor) or any additional distro-specific behavior.
  configUpdateCallback?: (remoteConfig: RemoteConfig) => void;
}

// this function is meant to be called by the specific agent implementation.
// it allows the agent to provide its own span processor, depending on the
// agent implementation (for example - eBPF span processor for enterprise agent)
export const startOpenTelemetryAgent = (options: StartOpenTelemetryAgentOptions): InstrumentationLibrariesTracerProviderSetter | undefined => {
  const { distroName, opampServerHost, spanProcessorExporting, additionalConfigs, configUpdateCallback, logger } = options;

  const otelDiag = createAndRegisterOtelDiag();

  const componentLogger = logger.createComponentLogger({
    namespace: "@odigos/opentelemetry-node",
  });

  componentLogger.info("Starting Odigos OpenTelemetry auto-instrumentation agent", {
    distroName,
    distroVersion: VERSION,
    opampServerHost,
  });

  if (!opampServerHost) {
    componentLogger.error(
      "Odigos OpenTelemetry agent: Missing required environment variables ODIGOS_OPAMP_SERVER_HOST. Skipping startup.",
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
      odigosEnvDetector,
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
    logger: logger.createComponentLogger({
      namespace: "@odigos/opentelemetry-node/opamp",
    }),
    onNewRemoteConfig: (remoteConfig: RemoteConfig) => {
      try {
        componentLogger.info("Applying new remote config", {
          remoteConfig,
        });

        configUpdateCallback?.(remoteConfig);

        logger.updateConfig(remoteConfig.containerConfig?.agentDiagnostics?.odigosLogLevel);
        otelDiag.updateConfig(remoteConfig.containerConfig?.agentDiagnostics?.openTelemetryComponentsLogLevel);

        // set the tracer provider based on if traces are enabled or not.
        let tracerProvider: TracerProvider | undefined;
        if (remoteConfig.containerConfig.traces) {
          const idGeneratorConfig = remoteConfig.containerConfig.traces?.idGenerator;
          const idGenerator = idGeneratorFromConfig(idGeneratorConfig);

          const headSamplingConfig = remoteConfig.containerConfig?.traces?.headSampling;

          tracerProvider = new OdigosNodeTracerProvider({
            resource,
            idGenerator,
            spanProcessors: [spanProcessorExporting],
          }, headSamplingConfig, logger);
        }

        instrumentationLibraries.updateConfig(remoteConfig, tracerProvider);
        opampClient.setSdkHealthy();
      } catch (err) {
        componentLogger.error("Error applying new remote config", err);
      }
    },
    initialPackageStatues: [], // TODO: fill this up
  });

  opampClient.start();

  const shutdown = async (shutdownReason: string) => {
    try {
      componentLogger.info("Shutting down OpenTelemetry SDK and OpAMP client");
      await Promise.all([
        opampClient.shutdown(shutdownReason),
        spanProcessorExporting.shutdown(),
      ]);
    } catch (err) {
      componentLogger.error("Error shutting down OpenTelemetry SDK and OpAMP client", err);
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
