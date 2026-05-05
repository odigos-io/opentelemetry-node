import { type MessageInitShape } from "@bufbuild/protobuf";
import { Attributes } from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { PackageStatusSchema } from "./generated/opamp_pb";
import { ContainerConfig } from "../config";

export interface OpAMPClientHttpConfig {
  serviceInstanceId: string;
  opAMPServerHost: string; // the host + (optional) port of the OpAMP server to connect over http://
  pollingIntervalMs?: number;

  agentDescriptionIdentifyingAttributes?: Attributes;
  agentDescriptionNonIdentifyingAttributes?: Attributes;

  initialPackageStatues: MessageInitShape<typeof PackageStatusSchema>[];

  onNewRemoteConfig: (remoteConfig: RemoteConfig) => void;
}

// Sdk Remote Configuration

export interface TraceSignalGeneralConfig {
  enabled: boolean; // if enabled is false, the pipeline is not configured to receive spans
  defaultEnabledValue: boolean;
}

// All remote config fields

export type RemoteConfig = {
  containerConfig: ContainerConfig;
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
