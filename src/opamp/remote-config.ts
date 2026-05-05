import { AgentRemoteConfig } from "./generated/opamp_pb";
import { RemoteConfig } from "./types";
import { ContainerConfig } from "../config";

export const extractRemoteConfigFromResponse = (
  agentRemoteConfig: AgentRemoteConfig,
): RemoteConfig => {

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
    containerConfig,
  };
};
