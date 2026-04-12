import { Instrumentation } from "@opentelemetry/instrumentation";
import { InstrumentationLibraryConfigFunction, InstrumentationLibraryManifest, instrumentationLibraryManifests } from "./config";
import { createInstrumentationLibraryInstance, isCollectingTraces, parseDisabledInstrumentations, resolveBaseConfig } from "./utils";
import { diag, ProxyTracerProvider, trace, TracerProvider } from "@opentelemetry/api";
import { RemoteConfig } from "../opamp";


type InstrumentationLibrary = {
    instrumentationInstance: Instrumentation;
    manifest: InstrumentationLibraryManifest;

    // function to add any additional config to the instrumentation library
    // for example - odigos enterprise can use this to configure specific 
    // attributes for spans (payload collection)
    additionalConfig?: InstrumentationLibraryConfigFunction;
};

export class InstrumentationLibraries {

    private instrumentationLibraries: Map<string, InstrumentationLibrary>;

    private globalProxyTracerProvider: ProxyTracerProvider;
    private noopTracerProvider: TracerProvider;

    constructor(addtionalConfig?: Record<string, InstrumentationLibraryConfigFunction>) {
        this.instrumentationLibraries = this.createInstrumentationLibraries(instrumentationLibraryManifests, addtionalConfig);

        // global tracer provider (not used for managed instrumentation libraries)
        this.globalProxyTracerProvider = new ProxyTracerProvider();
        trace.setGlobalTracerProvider(this.globalProxyTracerProvider);

        // trick to get the noop tracer provider which is not exported from @openetelemetry/api
        this.noopTracerProvider = this.globalProxyTracerProvider.getDelegate();
    }

    public updateConfig(remoteConfig: RemoteConfig | undefined, tracerProvider: TracerProvider | undefined): void {

        const collectingTraces = isCollectingTraces(remoteConfig);
        const tracerProviderInUse = collectingTraces && tracerProvider ? tracerProvider : this.noopTracerProvider;

        // set global tracer provider to record traces from 3rd party instrumented libraries
        for (const [_, instrumentationLibrary] of this.instrumentationLibraries.entries()) {
            const resolvedConfig = resolveBaseConfig(instrumentationLibrary.manifest, remoteConfig);
            const additionalConfig = instrumentationLibrary.additionalConfig?.(instrumentationLibrary.manifest.instrumentationNpmPackage, remoteConfig);
            const effectiveConfig = { ...resolvedConfig, ...additionalConfig };
            
            instrumentationLibrary.instrumentationInstance.setConfig(effectiveConfig ?? {});
            instrumentationLibrary.instrumentationInstance.setTracerProvider(tracerProviderInUse);
        }
    }

    public setTracerProvider(tracerProvider: TracerProvider) {
        for (const [_, instrumentationLibrary] of this.instrumentationLibraries.entries()) {
            instrumentationLibrary.instrumentationInstance.setTracerProvider(tracerProvider);
        }
    }

    private createInstrumentationLibraries(manifest: Map<string, InstrumentationLibraryManifest>, addtionalConfig?: Record<string, InstrumentationLibraryConfigFunction>): Map<string, InstrumentationLibrary> {
        const disabledInstrumentations = parseDisabledInstrumentations(process.env.ODIGOS_DISABLED_INSTRUMENTATION_LIBRARIES || "");
        const libraries = new Map<string, InstrumentationLibrary>();
        for (const [libraryName, libManifest] of manifest.entries()) {
            if (disabledInstrumentations.has(libraryName)) {
                diag.info("Skipping disabled instrumentation library", {
                    libraryName: libraryName,
                });
                continue;
            }
            const additionalConfigFn = addtionalConfig?.[libraryName];
            const instrumentationInstance = createInstrumentationLibraryInstance(libManifest, undefined, additionalConfigFn);
            if (instrumentationInstance) {
                libraries.set(libraryName, {
                    instrumentationInstance,
                    manifest: libManifest,
                    additionalConfig: additionalConfigFn,
                });
            }
        }
        return libraries;
    }

}