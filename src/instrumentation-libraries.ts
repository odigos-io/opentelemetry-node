import { Instrumentation } from "@opentelemetry/instrumentation";
import { ProxyTracerProvider, TracerProvider, diag, trace } from "@opentelemetry/api";
import {
  InstrumentationLibraryConfiguration,
  TraceSignalGeneralConfig,
} from "./opamp";
import { PackageStatus } from "./opamp/generated/opamp_pb";
import { PartialMessage } from "@bufbuild/protobuf";
import { getNodeAutoInstrumentations } from "./components";

type OdigosInstrumentation = {
  otelInstrumentation: Instrumentation;
};

const calculateLibraryEnabled = (
  traceSignal: TraceSignalGeneralConfig,
  instrumentationLibraryEnabled: boolean | undefined,
): boolean => {
  // if the signal is disabled globally, no library should be enabled
  if (!traceSignal.enabled) {
    return false;
  }

  // if there is a specific configuration for this library, use it
  if (instrumentationLibraryEnabled != null) {
    return instrumentationLibraryEnabled;
  }

  // if there is no remote config to enable/disable this library, use the default
  return traceSignal.defaultEnabledValue;
};

export class InstrumentationLibraries {
  private instrumentations: Instrumentation[];
  private instrumentationLibraries: OdigosInstrumentation[];

  private noopTracerProvider: TracerProvider;
  private globalProxyTracerProvider: ProxyTracerProvider;

  private logger = diag.createComponentLogger({
    namespace: "@odigos/opentelemetry-node/instrumentation-libraries",
  });

  constructor() {
    this.instrumentations = getNodeAutoInstrumentations();

    // global tracer provider (not used for managed instrumentation libraries)
    this.globalProxyTracerProvider = new ProxyTracerProvider();
    trace.setGlobalTracerProvider(this.globalProxyTracerProvider);

    // trick to get the noop tracer provider which is not exported from @openetelemetry/api
    this.noopTracerProvider = this.globalProxyTracerProvider.getDelegate();

    this.instrumentationLibraries = this.instrumentations.map(
      (otelInstrumentation) => {
        // start all instrumentations with a noop tracer provider.
        // the global tracer provider is noop by default, so this is just to make sure
        otelInstrumentation.setTracerProvider(this.noopTracerProvider);

        const odigosInstrumentation = {
          otelInstrumentation,
        };

        return odigosInstrumentation;
      }
    );
  }

  public getPackageStatuses(): PartialMessage<PackageStatus>[] {
    return this.instrumentations.map((instrumentation) => {
      return {
        name: instrumentation.instrumentationName,
        agentHasVersion: instrumentation.instrumentationVersion,
      };
    });
  }

  public onNewRemoteConfig(
    configs: InstrumentationLibraryConfiguration[],
    traceSignal: TraceSignalGeneralConfig,
    mainConfig: any,
    enabledTracerProvider: TracerProvider
  ) {
    // it will happen when the pipeline is not setup to receive spans
    const globalTracerProvider = traceSignal.enabled
      ? enabledTracerProvider
      : this.noopTracerProvider;
    // set global tracer provider to record traces from 3rd party instrumented libraries
    // or application manual instrumentation
    this.globalProxyTracerProvider.setDelegate(globalTracerProvider);

    // make the configs into a map by library name so it's quicker to find the right one
    const configsMap = new Map<string, InstrumentationLibraryConfiguration>(
      configs.map((config) => [config.name, config])
    );

    for (const odigosInstrumentation of this.instrumentationLibraries) {

      // for each installed library, calculate it's specific enabled state
      // which depends on the global trace signal and the specific library config
      const instrumentationLibraryConfig = configsMap.get(
        odigosInstrumentation.otelInstrumentation.instrumentationName
      );
      const enabled = calculateLibraryEnabled(
        traceSignal,
        instrumentationLibraryConfig?.traces?.enabled,
      );
      const tracerProviderInUse = enabled
        ? enabledTracerProvider
        : this.noopTracerProvider;
      odigosInstrumentation.otelInstrumentation.setTracerProvider(
        tracerProviderInUse
      );

      const instrumentationLibraryName = odigosInstrumentation.otelInstrumentation.instrumentationName;
      if (instrumentationLibraryName === '@opentelemetry/instrumentation-http') {
        const headerKeys = mainConfig?.headersCollection?.headerKeys;
        if (headerKeys) {
          odigosInstrumentation.otelInstrumentation.setConfig({
            headersToSpanAttributes: {
              server: {
                requestHeaders: headerKeys,
                responseHeaders: headerKeys,
              },
              client: {
                requestHeaders: headerKeys,
                responseHeaders: headerKeys,
              },
            },
          } as any);
        }
      }
    }
  }

  public getInstrumentations(): Instrumentation[] {
    return this.instrumentations;
  }
}
