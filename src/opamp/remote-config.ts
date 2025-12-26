import { AgentRemoteConfig } from "./generated/opamp_pb";
import { InstrumentationLibraryConfiguration, RemoteConfig } from "./types";
import { OpAMPSdkConfiguration } from "./opamp-types";
import { ContainerConfig } from "../config";

export const extractRemoteConfigFromResponse = (
  agentRemoteConfig: AgentRemoteConfig,
): RemoteConfig => {

  const instrumentationLibrariesConfigSection =
    agentRemoteConfig.config?.configMap["InstrumentationLibraries"];
  if (
    !instrumentationLibrariesConfigSection ||
    !instrumentationLibrariesConfigSection.body
  ) {
    throw new Error("missing instrumentation libraries remote config");
  }
  const instrumentationLibrariesConfigBody =
    instrumentationLibrariesConfigSection.body.toString();

  let instrumentationLibrariesConfig: InstrumentationLibraryConfiguration[];
  try {
    instrumentationLibrariesConfig = JSON.parse(
      instrumentationLibrariesConfigBody
    ) as InstrumentationLibraryConfiguration[];
  } catch (error) {
    throw new Error("error parsing instrumentation libraries remote config");
  }

  const containerConfigSection = agentRemoteConfig.config?.configMap["container_config"];
  if (!containerConfigSection || !containerConfigSection.body) {
    throw new Error("missing container config");
  }
  const containerConfigBody = containerConfigSection.body.toString();
  let containerConfig: ContainerConfig;
  try {
    containerConfig = JSON.parse(containerConfigBody) as ContainerConfig;
  } catch (error) {
    throw new Error("error parsing container config");
  }

  return {
    instrumentationLibraries: instrumentationLibrariesConfig,
    containerConfig,
  };
};
