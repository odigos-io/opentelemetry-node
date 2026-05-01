import { diag } from "@opentelemetry/api";
import { Instrumentation, InstrumentationConfig } from "@opentelemetry/instrumentation";
import { InstrumentationLibraryConfigFunction, InstrumentationLibraryManifest } from "./config";
import { RemoteConfig } from "../opamp";

export const parseDisabledInstrumentations = (disabledInstrumentationsEnv: string): Set<string> => {
    const disabledInstrumentations = disabledInstrumentationsEnv ? disabledInstrumentationsEnv.trim().split(",") : [];
    const normalizedDisabledInstrumentations =  disabledInstrumentations
      .flatMap((instrumentation) => {
        if (instrumentation.startsWith("@opentelemetry/instrumentation-") || instrumentation.startsWith("@odigos/instrumentation-")) {
          return [instrumentation];
        } else {
          // support disabling both community and odigos-prefixed names
          return [
            `@opentelemetry/instrumentation-${instrumentation}`,
            `@odigos/instrumentation-${instrumentation}`,
          ];
        }
      });
  
    return new Set(normalizedDisabledInstrumentations);
  };
  

export const createInstrumentationLibraryInstance = (
    manifest: InstrumentationLibraryManifest,
    remoteConfig: RemoteConfig | undefined,
    additionalConfigFn?: InstrumentationLibraryConfigFunction
): Instrumentation | undefined => {

    const instrumentationConfig = resolveBaseConfig(manifest, remoteConfig);
    const additionalConfig = additionalConfigFn?.(manifest.instrumentationNpmPackage, remoteConfig, instrumentationConfig) ?? {};

    const effectiveConfig = { ...instrumentationConfig, ...additionalConfig };

    if (typeof manifest.import === "function") {
        return manifest.import(effectiveConfig);
    } else if (typeof manifest.import === "string") {
        return safeCreateInstrumentationLibrary(manifest.instrumentationNpmPackage, manifest.import, effectiveConfig);
    } else {
        diag.warn("Invalid import type for instrumentation library", {
            manifest: manifest.instrumentationNpmPackage,
            import: manifest.import,
        });
        return undefined;
    }
}

export const resolveBaseConfig = (manifest: InstrumentationLibraryManifest, remoteConfig: RemoteConfig | undefined): InstrumentationConfig => {
    if (!manifest.config) {
        return {}
    }

    if (typeof manifest.config === "function") {
        return manifest.config(manifest.instrumentationNpmPackage, remoteConfig, undefined);
    } else {
        return manifest.config;
    }
}

const safeCreateInstrumentationLibrary = (
    npmPackageName: string,
    importName: string,
    instrumentationConfig: InstrumentationConfig | undefined
): Instrumentation | undefined => {
    try {
        const moduleExports = require(npmPackageName);
        const instrumentationClass = moduleExports[importName];
        if (!instrumentationClass) {
            diag.warn(
                "Failed to require instrumentation class. this might be ok for EOF node versions",
                { npmPackageName, importName }
            );
            return undefined;
        }
        const instrumentation = new instrumentationClass(instrumentationConfig);
        return instrumentation;
    } catch (e) {
        diag.error("Failed to require and instantiate an instrumentation class", {
            npmPackageName,
            importName,
        });
        return undefined;
    }
};

// returns true if traces are enabled in the remote config
export const isCollectingTraces = (remoteConfig: RemoteConfig | undefined): boolean => {
    return remoteConfig?.containerConfig.traces !== undefined;
}

// givin the relevant configurations for a specific instrumentation library, returns true if the library should be traced.
export const calculateLibraryTracesEnabled = (collectingTraces: boolean, isDisabledByConfig: boolean, isEnabledByConfig: boolean, isDisabledByDefault: boolean): boolean => {

    // when there is no traces destination or span-metrics, we don't need to collect traces from any instrumentation libraries.
    if (!collectingTraces) {
        return false;
    }

    if (isDisabledByConfig) {
        return false;
    }

    // noisy instrumentation libraries are disabled by default.
    // we check if they are opt-in  (if they are enabled by config)
    if (isDisabledByDefault) {
        if (isEnabledByConfig) {
            return true;
        }
        return false;
    }

    // instrumentation libraries are enabled by default if no other configuration is provided.
    return true;
}