import { PartialMessage } from "@bufbuild/protobuf";
import {
  AgentDescription,
  AgentToServer,
  RemoteConfigStatus,
  RemoteConfigStatuses,
  ServerToAgent,
  ServerToAgentFlags,
} from "./generated/opamp_pb";
import { OpAMPClientHttpConfig, RemoteConfig, SdkHealthStatus, SdkHealthInfo } from "./types";
import { otelAttributesToKeyValuePairs, sdkHealthInfoToOpampMessage } from "./utils";
import { uuidv7 } from "uuidv7";
import axios, { AxiosInstance } from "axios";
import { Resource } from "@opentelemetry/resources";
import { context, diag } from "@opentelemetry/api";
import {
  SEMRESATTRS_SERVICE_INSTANCE_ID,
  SEMRESATTRS_SERVICE_NAME,
} from "@opentelemetry/semantic-conventions";
import { suppressTracing } from "@opentelemetry/core";
import { PackageStatuses } from "./generated/opamp_pb";
import { extractRemoteConfigFromResponse } from "./remote-config";

export class OpAMPClientHttp {
  private config: OpAMPClientHttpConfig;
  private opampInstanceUidString: string;
  private OpAMPInstanceUidBytes: Uint8Array;
  private nextSequenceNum: bigint = BigInt(0);
  private httpClient: AxiosInstance;
  private logger = diag.createComponentLogger({
    namespace: "@odigos/opentelemetry-node/opamp",
  });
  private remoteConfigStatus: RemoteConfigStatus | undefined;
  // the remote config to use when we failed to get data from the server
  private defaultRemoteConfig: RemoteConfig;

  // store a reference to the heartbeat timer so it can be stopped on shutdown
  private heartbeatTimer: NodeJS.Timeout | undefined;

  private lastSdkHealthInfo: SdkHealthInfo;

  constructor(config: OpAMPClientHttpConfig) {
    this.config = config;
    this.opampInstanceUidString = uuidv7();
    this.OpAMPInstanceUidBytes = new TextEncoder().encode(
      this.opampInstanceUidString
    );
    this.lastSdkHealthInfo = {
      errorMessage: "Node.js OpenTelemetry agent is starting",
      status: SdkHealthStatus.Starting,
    };
    this.httpClient = axios.create({
      baseURL: `http://${this.config.opAMPServerHost}`,
      headers: {
        "Content-Type": " application/x-protobuf",
      },
      timeout: 5000,
    });

    // avoid printing to noisy axios logs to the diag logger
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        const relevantErrorInfo = {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
        };
        return Promise.reject(relevantErrorInfo);
      }
    );

    // on any issue connection to opamp server, this will be the default remote config which will be applied
    this.defaultRemoteConfig = {
      sdk: {
        remoteResource: new Resource({
          [SEMRESATTRS_SERVICE_INSTANCE_ID]: this.opampInstanceUidString,
        }),
        traceSignal: {
          enabled: true,
          defaultEnabledValue: true,
        },
      },
      instrumentationLibraries: [],
    };
  }

  async setSdkHealthy() {
    // avoid sending the health message with no change
    if (this.lastSdkHealthInfo.status === SdkHealthStatus.Healthy) {
      return;
    }
    
    this.lastSdkHealthInfo = {
      status: SdkHealthStatus.Healthy,
    };
    try {
      await this.sendAgentToServerMessage(sdkHealthInfoToOpampMessage(this.lastSdkHealthInfo));
    } catch (error) {
      this.logger.warn("Error sending SDK health message to OpAMP server", error);
    }
  }

  // start the OpAMP client.
  // if err is provided, OpAMP will not start and will send an AgentDisconnect message to the server
  // with the error message and then exit.
  // use it when the SDK is not able to start for some reason and you want to notify the server about it.
  async start(unhealthy?: SdkHealthInfo) {
    const fullStateAgentToServerMessage =
      this.getFullStateAgentToServerMessage();
    if (unhealthy) {
      this.logger.error(
        "OpAMP client report SDK unhealthy and will not start.",
        { ...unhealthy }
      );
      const agentDisconnectMessage = {
        agentDisconnect: {},
        ...sdkHealthInfoToOpampMessage(unhealthy),
      };
      const firstAgentToServer = {
        ...fullStateAgentToServerMessage,
        ...agentDisconnectMessage,
      };
      await this.sendFirstMessageWithRetry(firstAgentToServer);
      return;
    }

    await this.sendFirstMessageWithRetry(fullStateAgentToServerMessage);
    this.heartbeatTimer = setInterval(async () => {
      let heartbeatRes = await this.sendHeartBeatToServer();
      if (!heartbeatRes) {
        return;
      }

      // flags is bitmap, use bitwise AND to check if the flag is set
      if (
        Number(heartbeatRes.flags) &
        Number(ServerToAgentFlags.ServerToAgentFlags_ReportFullState)
      ) {
        this.logger.info("Opamp server requested full state report");
        try {
          const agentToServerFullState =
            this.getFullStateAgentToServerMessage();
          const healthMessage = sdkHealthInfoToOpampMessage(this.lastSdkHealthInfo)
          await this.sendAgentToServerMessage({ ...agentToServerFullState, ...healthMessage} );
        } catch (error) {
          this.logger.warn(
            "Error sending full state to OpAMP server on heartbeat response",
            error
          );
        }
      }
    }, this.config.pollingIntervalMs || 10000);
    this.heartbeatTimer.unref(); // do not keep the process alive just for this timer
  }

  async shutdown(shutdownReason: string) {
    if (!this.heartbeatTimer) {
      this.logger.info("OpAMP client shutdown called on an inactive opamp client");
      return;
    }

    this.lastSdkHealthInfo = {
      status: SdkHealthStatus.ProcessTerminated,
      errorMessage: shutdownReason,
    }

    this.logger.info("Sending AgentDisconnect message to OpAMP server");
    try {
      await this.sendAgentToServerMessage({
        agentDisconnect: {},
        ...sdkHealthInfoToOpampMessage(this.lastSdkHealthInfo),
      });
    } catch (error) {
      this.logger.error(
        "Error sending AgentDisconnect message to OpAMP server"
      );
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  // the first opamp message is special, as we need to get the remote resource attributes.
  // this function will attempt to send the first message, and will retry after some interval if it fails.
  // if no remote resource attributes are received after some grace period, we will continue without them.
  private async sendFirstMessageWithRetry(
    firstAgentToServer: PartialMessage<AgentToServer>
  ) {
    let remainingRetries = 5;
    const retryIntervalMs = 2000;

    for (let i = 0; i < remainingRetries; i++) {
      try {
        const firstServerToAgent = await this.sendAgentToServerMessage(
          firstAgentToServer
        );
        this.handleFirstMessageResponse(firstServerToAgent);
        return;
      } catch (error) {
        this.logger.warn(
          `Error sending first message to OpAMP server, retrying in ${retryIntervalMs}ms`,
          error
        );
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, retryIntervalMs);
          timer.unref(); // do not keep the process alive just for this timer
        });
      }
    }

    // if we got here, it means we run out of retries and did not return from the loop
    // at this point we have no remote resource attributes, so we will continue without them.
    this.logger.error(
      `Failed to get remote resource attributes from OpAMP server after retries, continuing without them`
    );
    try {
      this.config.onNewRemoteConfig(this.defaultRemoteConfig);
    } catch (error) {
      this.logger.error(
        "Error handling default remote config on startup",
        error
      );
    }
  }

  private handleFirstMessageResponse(serverToAgentMessage: ServerToAgent) {
    const remoteConfigOpampMessage = serverToAgentMessage.remoteConfig;
    if (!remoteConfigOpampMessage) {
      throw new Error(
        "No remote config received on first OpAMP message to the server"
      );
    }

    // the configs should have already been processed. Simply log the message and continue
    this.logger.info("Got remote configuration on first opamp message");
  }

  private handleRemoteConfigInResponse(serverToAgentMessage: ServerToAgent) {
    const remoteConfigOpampMessage = serverToAgentMessage.remoteConfig;
    if (!remoteConfigOpampMessage) {
      return;
    }

    try {
      const remoteConfig = extractRemoteConfigFromResponse(
        remoteConfigOpampMessage,
        this.opampInstanceUidString
      );
      this.logger.info(
        "Got remote configuration from OpAMP server",
        remoteConfig.sdk.remoteResource.attributes,
        { traceSignal: remoteConfig.sdk.traceSignal }
      );
      this.config.onNewRemoteConfig(remoteConfig);
      this.remoteConfigStatus = new RemoteConfigStatus({
        lastRemoteConfigHash: remoteConfigOpampMessage.configHash,
        status: RemoteConfigStatuses.RemoteConfigStatuses_APPLIED,
      });
    } catch (error) {
      this.remoteConfigStatus = new RemoteConfigStatus({
        lastRemoteConfigHash: remoteConfigOpampMessage.configHash,
        status: RemoteConfigStatuses.RemoteConfigStatuses_FAILED,
        errorMessage: "failed to apply the new remote config",
      });
      this.logger.warn(
        "Error extracting remote config from OpAMP message",
        error
      );
      return;
    }
  }

  private async sendHeartBeatToServer() {
    try {
      return await this.sendAgentToServerMessage({});
    } catch (error) {
      this.logger.warn("Error sending heartbeat to OpAMP server", error);
    }
  }

  private getFullStateAgentToServerMessage(): PartialMessage<AgentToServer> {
    return {
      agentDescription: new AgentDescription({
        identifyingAttributes: otelAttributesToKeyValuePairs({
          [SEMRESATTRS_SERVICE_INSTANCE_ID]: this.opampInstanceUidString, // always send the instance id
          ...this.config.agentDescriptionIdentifyingAttributes,
        }),
        nonIdentifyingAttributes: otelAttributesToKeyValuePairs(
          this.config.agentDescriptionNonIdentifyingAttributes
        ),
      }),
      packageStatuses: new PackageStatuses({
        packages: Object.fromEntries(
          this.config.initialPackageStatues.map((pkg) => [pkg.name, pkg])
        ),
      }),
      ...sdkHealthInfoToOpampMessage(this.lastSdkHealthInfo),
    };
  }

  private async sendAgentToServerMessage(
    message: PartialMessage<AgentToServer>
  ): Promise<ServerToAgent> {
    const completeMessageToSend = new AgentToServer({
      ...message,
      instanceUid: this.OpAMPInstanceUidBytes,
      sequenceNum: this.nextSequenceNum++,
      remoteConfigStatus: this.remoteConfigStatus,
    });
    const msgBytes = completeMessageToSend.toBinary();
    try {
      // do not create traces for the opamp http requests
      const serverToAgent = await context.with(
        suppressTracing(context.active()),
        async () => {
          const res = await this.httpClient.post("/v1/opamp", msgBytes, {
            responseType: "arraybuffer",
          });
          const serverToAgent = ServerToAgent.fromBinary(res.data);
          return serverToAgent;
        }
      );
      this.handleRemoteConfigInResponse(serverToAgent);
      return serverToAgent;
    } catch (error) {
      // TODO: handle
      throw error;
    }
  }
}
