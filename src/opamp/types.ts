import { Attributes } from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { PackageStatus } from "./generated/opamp_pb";
import { PartialMessage } from "@bufbuild/protobuf";

export interface OpAMPClientHttpConfig {
  opAMPServerHost: string; // the host + (optional) port of the OpAMP server to connect over http://
  pollingIntervalMs?: number;

  agentDescriptionIdentifyingAttributes?: Attributes;
  agentDescriptionNonIdentifyingAttributes?: Attributes;

  initialPackageStatues: PartialMessage<PackageStatus>[];

  onNewRemoteConfig: (remoteConfig: RemoteConfig) => void;
}

// Sdk Remote Configuration

export interface TraceSignalGeneralConfig {
  enabled: boolean; // if enabled is false, the pipeline is not configured to receive spans
  defaultEnabledValue: boolean;
}

export interface SdkConfiguration {
  remoteResource: Resource; // parse resource object
  traceSignal: TraceSignalGeneralConfig;
}

// InstrumentationLibrary Remote Configuration
export interface InstrumentationLibraryTracesConfiguration {
  // if the value is set, use it, otherwise use the default value from the trace signal in the sdk level
  enabled?: boolean;
}
export interface InstrumentationLibraryConfiguration {
  name: string;
  traces: InstrumentationLibraryTracesConfiguration;
}

// All remote config fields

export type RemoteConfig = {
  sdk: SdkConfiguration;
  instrumentationLibraries: InstrumentationLibraryConfiguration[];
  mainConfig: any;
};

// these enums are agreed upon with the OpAMP server.
// they represents the health status of the SDK in known states which can be processed programmatically.
export enum SdkHealthStatus {
  Healthy = "Healthy",
  UnsupportedRuntimeVersion = "UnsupportedRuntimeVersion",
  ProcessTerminated = "ProcessTerminated",
  Starting = "Starting",
}

export type SdkHealthInfo = {
  errorMessage?: string;
  status: SdkHealthStatus;
};
