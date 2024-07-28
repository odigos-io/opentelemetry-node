import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
// For development, uncomment the following line to see debug logs
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
diag.info("Starting Odigos OpenTelemetry auto-instrumentation agent");

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OpAMPClientHttp, RemoteConfig, SdkHealthStatus } from "./opamp";
import {
  SEMRESATTRS_TELEMETRY_SDK_LANGUAGE,
  TELEMETRYSDKLANGUAGEVALUES_NODEJS,
  SEMRESATTRS_PROCESS_PID,
  SEMRESATTRS_PROCESS_RUNTIME_VERSION,
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
} from "@opentelemetry/sdk-trace-node";
import * as semver from "semver";

// not yet published in '@opentelemetry/semantic-conventions'
const SEMRESATTRS_TELEMETRY_DISTRO_NAME = "telemetry.distro.name";
const SEMRESATTRS_TELEMETRY_DISTRO_VERSION = "telemetry.distro.version";

const opampServerHost = process.env.ODIGOS_OPAMP_SERVER_HOST;
const instrumentationDeviceId = process.env.ODIGOS_INSTRUMENTATION_DEVICE_ID;

const agentDescriptionIdentifyingAttributes = {
  [SEMRESATTRS_TELEMETRY_SDK_LANGUAGE]: TELEMETRYSDKLANGUAGEVALUES_NODEJS,
  [SEMRESATTRS_PROCESS_RUNTIME_VERSION]: process.versions.node,
  [SEMRESATTRS_TELEMETRY_DISTRO_VERSION]: VERSION,
  [SEMRESATTRS_PROCESS_PID]: process.pid,
};

const startOpenTelemetryAgent = (instrumentationDeviceId: string, opampServerHost: string) => {
  const staticResource = new Resource({
    [SEMRESATTRS_TELEMETRY_DISTRO_NAME]: "odigos",
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

  // span processor
  const spanProcessor = new BatchSpanProcessor(new OTLPTraceExporter());

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
    instrumentationDeviceId: instrumentationDeviceId,
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
    },
    initialPackageStatues: instrumentationLibraries.getPackageStatuses(),
  });

  opampClient.start();

  const shutdown = async () => {
    try {
      diag.info("Shutting down OpenTelemetry SDK and OpAMP client");
      await Promise.all([
        // sdk.shutdown(),
        opampClient.shutdown(),
        spanProcessor.shutdown(),
      ]);
    } catch (err) {
      diag.error("Error shutting down OpenTelemetry SDK and OpAMP client", err);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("exit", shutdown);
}



if (!opampServerHost || !instrumentationDeviceId) {
  diag.error(
    "Missing required environment variables ODIGOS_OPAMP_SERVER_HOST and ODIGOS_INSTRUMENTATION_DEVICE_ID"
  );
} else if (semver.lt(process.versions.node, "14.0.0")) {
  diag.warn("OpenTelemetry Node.js SDK requires Node.js version 14 or higher, Skipping auto-instrumentation.", { nodeVersion: process.versions.node });

  const opampClient = new OpAMPClientHttp({
    instrumentationDeviceId: instrumentationDeviceId,
    opAMPServerHost: opampServerHost,
    agentDescriptionIdentifyingAttributes,
    agentDescriptionNonIdentifyingAttributes: {},
    onNewRemoteConfig: (remoteConfig: RemoteConfig) => {},
    initialPackageStatues: [],
  });
  const errorMessage = `Node.js runtime version not supported by OpenTelemetry SDK. Found: '${process.versions.node}' supports: '>=14'`;
  opampClient.start({
    errorMessage,
    status: SdkHealthStatus.UnsupportedRuntimeVersion,
  });
} else {
  startOpenTelemetryAgent(instrumentationDeviceId, opampServerHost);
}
