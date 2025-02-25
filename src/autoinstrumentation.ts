import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
// For development, uncomment the following line to see debug logs
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
diag.info("Starting Odigos OpenTelemetry auto-instrumentation agent");

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
} from "@opentelemetry/sdk-trace-node";
import * as semver from "semver";

// not yet published in '@opentelemetry/semantic-conventions'
const SEMRESATTRS_TELEMETRY_DISTRO_NAME = "telemetry.distro.name";
const SEMRESATTRS_TELEMETRY_DISTRO_VERSION = "telemetry.distro.version";

const k8sAttributeMapping = {
  ODIGOS_WORKLOAD_NAMESPACE: SEMRESATTRS_K8S_NAMESPACE_NAME,
  ODIGOS_CONTAINER_NAME: SEMRESATTRS_K8S_CONTAINER_NAME,
  ODIGOS_POD_NAME: SEMRESATTRS_K8S_POD_NAME
};

const k8sAttributes = Object.entries(k8sAttributeMapping)
  .reduce<Record<string, string>>((acc, [envVar, attrKey]) => {
    if (process.env[envVar]) {
      acc[attrKey] = process.env[envVar] as string;
    }
    return acc;
  }, {});

const agentDescriptionIdentifyingAttributes = {
  [SEMRESATTRS_TELEMETRY_SDK_LANGUAGE]: TELEMETRYSDKLANGUAGEVALUES_NODEJS,
  [SEMRESATTRS_PROCESS_RUNTIME_VERSION]: process.versions.node,
  [SEMRESATTRS_TELEMETRY_DISTRO_VERSION]: VERSION,
  ["process.vpid"]: process.pid,
  ...k8sAttributes
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
  });

  const detectorsResource = detectResourcesSync({
    detectors: [
      // env detector reads resource attributes from the environment.
      // we don't populate it at the moment, but if the user set anything, this detector will pick it up
      envDetectorSync,
      // info about executable, runtime, command, etc
      processDetectorSync,
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
  const localResource = staticResource.merge(detectorsResource);

  const opampClient = new OpAMPClientHttp({
    opAMPServerHost: opampServerHost,
    agentDescriptionIdentifyingAttributes,
    agentDescriptionNonIdentifyingAttributes: {},
    onNewRemoteConfig: (remoteConfig: RemoteConfig) => {
      const resource = localResource
        .merge(remoteConfig.sdk.remoteResource);

      // tracer provider
      const tracerProvider = new NodeTracerProvider({
        resource,
      });
      tracerProvider.addSpanProcessor(spanProcessor);
      instrumentationLibraries.onNewRemoteConfig(
        remoteConfig.instrumentationLibraries,
        remoteConfig.sdk.traceSignal,
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
}
