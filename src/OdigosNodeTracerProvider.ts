import type { TracerProvider, Tracer as ApiTracer, DiagLogger } from "@opentelemetry/api";
import {
  merge,
} from "@opentelemetry/core";
import type { Resource } from "@opentelemetry/resources";
import { defaultResource } from "@opentelemetry/resources";
import {
  type SpanProcessor,
  type TracerConfig,
  type Sampler,
  ParentBasedSampler,
  AlwaysOnSampler
} from "@opentelemetry/sdk-trace-base";
import { loadDefaultConfig } from "@opentelemetry/sdk-trace-base/build/src/config";
import { MultiSpanProcessor } from "@opentelemetry/sdk-trace-base/build/src/MultiSpanProcessor";
import { Tracer } from "@opentelemetry/sdk-trace-base/build/src/Tracer";
import { reconfigureLimits } from "@opentelemetry/sdk-trace-base/build/src/utility";
import { HeadSamplingConfig } from "./config";
import { getHeadSamplingOperationKindsForScope } from "./instrumentations/config";
import { OdigosScopedHeadSampler, parseHeadSamplingConfig } from "./sampler/OdigosScopedHeadSampler";
import { OdigosDiagLogger } from "./diag";

export enum ForceFlushState {
  "resolved",
  "timeout",
  "error",
  "unresolved",
}

/**
 * Odigos Node.js TracerProvider.
 *
 * Based on BasicTracerProvider and NodeTracerProvider from @opentelemetry/sdk-trace-node.
 */
export class OdigosNodeTracerProvider implements TracerProvider {
  private readonly _config: TracerConfig;
  private readonly _tracers: Map<string, Tracer> = new Map();
  private readonly _resource: Resource;
  private readonly _activeSpanProcessor: MultiSpanProcessor;

  private readonly _logger: DiagLogger;

  private readonly _parsedHeadSamplingConfig;

  // sampler per scope that we've created
  private readonly _scopeToSampler: Map<string, Sampler> = new Map();

  constructor(config: TracerConfig, headSamplingConfig: HeadSamplingConfig | undefined, logger: OdigosDiagLogger) {
    const mergedConfig = merge(
      {},
      loadDefaultConfig(),
      reconfigureLimits(config)
    );
    this._resource = mergedConfig.resource ?? defaultResource();

    this._logger = logger.createComponentLogger({ namespace: '@odigos/opentelemetry-node/tracer-provider' });
    this._parsedHeadSamplingConfig = parseHeadSamplingConfig(headSamplingConfig ?? {}, this._logger);

    this._config = Object.assign({}, mergedConfig, {
      resource: this._resource,
    });

    const spanProcessors: SpanProcessor[] = [];

    if (config.spanProcessors?.length) {
      spanProcessors.push(...config.spanProcessors);
    }

    this._activeSpanProcessor = new MultiSpanProcessor(spanProcessors);
  }

  private getSampler(scopeName: string): Sampler {
    if (this._scopeToSampler.has(scopeName)) {
      return this._scopeToSampler.get(scopeName)!;
    }

    const enabledOperationKinds = getHeadSamplingOperationKindsForScope(scopeName);
    const sampler = new ParentBasedSampler({
      root: new OdigosScopedHeadSampler(this._parsedHeadSamplingConfig, this._logger, scopeName, enabledOperationKinds),
    });
    this._scopeToSampler.set(scopeName, sampler);
    return sampler;
  }

  getTracer(
    name: string,
    version?: string,
    options?: { schemaUrl?: string }
  ): ApiTracer {
    const key = `${name}@${version || ""}:${options?.schemaUrl || ""}`;
    if (!this._tracers.has(key)) {
      const sampler = this.getSampler(name);
      const tracerConfig = { ...this._config, sampler };
      this._tracers.set(
        key,
        new Tracer(
          { name, version, schemaUrl: options?.schemaUrl },
          tracerConfig,
          this._resource,
          this._activeSpanProcessor
        )
      );
    }

    return this._tracers.get(key)!;
  }

  forceFlush(): Promise<void> {
    const timeout = this._config.forceFlushTimeoutMillis;
    const promises = this._activeSpanProcessor["_spanProcessors"].map(
      (spanProcessor: SpanProcessor) => {
        return new Promise(resolve => {
          let state: ForceFlushState;
          const timeoutInterval = setTimeout(() => {
            resolve(
              new Error(
                `Span processor did not completed within timeout period of ${timeout} ms`
              )
            );
            state = ForceFlushState.timeout;
          }, timeout);

          spanProcessor
            .forceFlush()
            .then(() => {
              clearTimeout(timeoutInterval);
              if (state !== ForceFlushState.timeout) {
                state = ForceFlushState.resolved;
                resolve(state);
              }
            })
            .catch(error => {
              clearTimeout(timeoutInterval);
              state = ForceFlushState.error;
              resolve(error);
            });
        });
      }
    );

    return new Promise<void>((resolve, reject) => {
      Promise.all(promises)
        .then(results => {
          const errors = results.filter(
            result => result !== ForceFlushState.resolved
          );
          if (errors.length > 0) {
            reject(errors);
          } else {
            resolve();
          }
        })
        .catch(error => reject([error]));
    });
  }

  shutdown(): Promise<void> {
    return this._activeSpanProcessor.shutdown();
  }
}
