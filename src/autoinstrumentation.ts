import { diag, DiagConsoleLogger, DiagLogLevel, TracerProvider } from "@opentelemetry/api";
// For development, uncomment the following line to see debug logs
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
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
  SEMRESATTRS_TELEMETRY_SDK_LANGUAGE,
  TELEMETRYSDKLANGUAGEVALUES_NODEJS,
  SEMRESATTRS_PROCESS_RUNTIME_VERSION,
  SEMRESATTRS_K8S_NAMESPACE_NAME,
  SEMRESATTRS_K8S_POD_NAME,
  SEMRESATTRS_K8S_CONTAINER_NAME,
  SEMRESATTRS_SERVICE_INSTANCE_ID,
} from "@opentelemetry/semantic-conventions";
import {
  Resource,
  detectResourcesSync,
  envDetectorSync,
  hostDetectorSync,
  processDetectorSync,
} from "@opentelemetry/resources";
import {
  AsyncHooksContextManager,
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
import * as semver from "semver";
import { OdigosProcessDetector, PROCESS_VPID } from "./OdigosProcessDetector";
import { idGeneratorFromConfig } from "./id-generator";
import { OdigosHeadSampler } from "./sampler";

// not yet published in '@opentelemetry/semantic-conventions'
const SEMRESATTRS_TELEMETRY_DISTRO_NAME = "telemetry.distro.name";
const SEMRESATTRS_TELEMETRY_DISTRO_VERSION = "telemetry.distro.version";

const serviceInstanceId = uuidv7();

const agentDescriptionIdentifyingAttributes = {
  [SEMRESATTRS_TELEMETRY_SDK_LANGUAGE]: TELEMETRYSDKLANGUAGEVALUES_NODEJS,
  [SEMRESATTRS_PROCESS_RUNTIME_VERSION]: process.versions.node,
  [SEMRESATTRS_TELEMETRY_DISTRO_VERSION]: VERSION,
  [PROCESS_VPID]: process.pid,
  [SEMRESATTRS_SERVICE_INSTANCE_ID]: serviceInstanceId,
  [SEMRESATTRS_K8S_NAMESPACE_NAME]: process.env.ODIGOS_WORKLOAD_NAMESPACE || undefined,
  [SEMRESATTRS_K8S_POD_NAME]: process.env.ODIGOS_POD_NAME || undefined,
  [SEMRESATTRS_K8S_CONTAINER_NAME]: process.env.ODIGOS_CONTAINER_NAME || undefined,
};


// used by native-community agent
export const createNativeCommunitySpanProcessor = (): SpanProcessor => {
  return new BatchSpanProcessor(new OTLPTraceExporter());
}

// this function is meant to be called by the specific agent implementation.
// it allows the agent to provide its own span processor, depending on the
// agent implementation (for example - eBPF span processor for enterprise agent)
export const startOpenTelemetryAgent = (distroName: string, opampServerHost: string, spanProcessor: SpanProcessor) => {
  if (!opampServerHost) {
    diag.error(
      "Missing required environment variables ODIGOS_OPAMP_SERVER_HOST"
    );
    return;
  }

  const staticResource = new Resource({
    [SEMRESATTRS_TELEMETRY_DISTRO_NAME]: distroName,
    [SEMRESATTRS_TELEMETRY_DISTRO_VERSION]: VERSION,
    [SEMRESATTRS_SERVICE_INSTANCE_ID]: serviceInstanceId,
  });

  const detectorsResource = detectResourcesSync({
    detectors: [
      // env detector reads resource attributes from the environment.
      // we don't populate it at the moment, but if the user set anything, this detector will pick it up
      envDetectorSync,
      // info about executable, runtime, command, etc
      new OdigosProcessDetector(),
      // host name, and arch
      hostDetectorSync,
    ],
  });

  // context manager
  const ContextManager = semver.gte(process.versions.node, "14.8.0")
    ? AsyncLocalStorageContextManager
    : AsyncHooksContextManager;
  const contextManager = new ContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  // propagator
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });
  propagation.setGlobalPropagator(propagator);

  const { InstrumentationLibraries } = require("./instrumentation-libraries");
  // instrumentation libraries
  const instrumentationLibraries = new InstrumentationLibraries();

  const resource = staticResource.merge(detectorsResource);

  const opampClient = new OpAMPClientHttp({
    serviceInstanceId,
    opAMPServerHost: opampServerHost,
    agentDescriptionIdentifyingAttributes,
    agentDescriptionNonIdentifyingAttributes: {},
    onNewRemoteConfig: (remoteConfig: RemoteConfig) => {

      // set the tracer provider based on if traces are enabled or not.
      let tracerProvider: TracerProvider;
      if (remoteConfig.containerConfig.traces) {
        const idGeneratorConfig = remoteConfig.containerConfig.traces?.idGenerator;
        const idGenerator = idGeneratorFromConfig(idGeneratorConfig);

        var sampler: Sampler | undefined = undefined;
        const headSamplingConfig = remoteConfig.containerConfig?.traces?.headSampling;
        if (headSamplingConfig) {
          sampler = new ParentBasedSampler({
            root: new OdigosHeadSampler(headSamplingConfig),
          });
        }

        const nodeTracerProvider = new NodeTracerProvider({
          sampler,
          resource,
          idGenerator,
        });
        nodeTracerProvider.addSpanProcessor(spanProcessor);
        tracerProvider = nodeTracerProvider;
      } else {
        tracerProvider = instrumentationLibraries.getNoopTracerProvider();
      }

      instrumentationLibraries.onNewRemoteConfig(
        remoteConfig.instrumentationLibraries,
        remoteConfig.containerConfig,
        tracerProvider
      );
      opampClient.setSdkHealthy();
    },
    initialPackageStatues: instrumentationLibraries.getPackageStatuses(),
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

  return {
    instrumentations: instrumentationLibraries.getInstrumentations(),
  }
}
