import { Attributes, Context, createTraceState, DiagLogger, Link, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult } from "@opentelemetry/sdk-trace-base";
import { HeadSamplingConfig, NoisyOperationSamplingConfig } from "../config";
import { parseHttpServerAttributes, parseHttpClientAttributes, parseGrpcAttributes } from "./utils";
import { samplingDecisionByPercentage } from "./percentage";
import { HeadSamplingOperationKind, ParsedGrpcRule, ParsedHeadSamplingConfig, ParsedHttpRule } from "./types";
import { createGrpcMethodMatcher, createGrpcServiceMatcher, createHttpMethodMatcher, createHttpPathMatcher, createHttpServerAddressMatcher as createServerAddressMatcher } from "./path-matching";

const spanKindToString = (spanKind: SpanKind): string => {
    return SpanKind[spanKind] ?? String(spanKind);
}

export function parseHeadSamplingConfig(config: HeadSamplingConfig, logger: DiagLogger): ParsedHeadSamplingConfig {
    const serviceRules: NoisyOperationSamplingConfig[] = [];
    const httpServerRules: ParsedHttpRule[] = [];
    const httpClientRules: ParsedHttpRule[] = [];
    const grpcServerRules: ParsedGrpcRule[] = [];
    const grpcClientRules: ParsedGrpcRule[] = [];

    try {
        const noisyOperations = config.noisyOperations ?? [];
        for (const rule of noisyOperations) {
            if (rule.disabled) {
                continue;
            }

            if (!rule.operation) {
                serviceRules.push(rule);
            } else if (rule.operation.httpServer) {
                const pathMatcher = createHttpPathMatcher(rule.operation.httpServer.route, rule.operation.httpServer.routePrefix);
                const methodMatcher = createHttpMethodMatcher(rule.operation.httpServer.method);
                httpServerRules.push({ pathMatcher, methodMatcher, rule });
            } else if (rule.operation.httpClient) {
                const pathMatcher = createHttpPathMatcher(rule.operation.httpClient.templatedPath, rule.operation.httpClient.templatedPathPrefix);
                const methodMatcher = createHttpMethodMatcher(rule.operation.httpClient.method);
                const serverAddressMatcher = createServerAddressMatcher(rule.operation.httpClient.serverAddress);
                httpClientRules.push({ pathMatcher, methodMatcher, serverAddressMatcher, rule });
            } else if (rule.operation.grpcServer) {
                const methodMatcher = createGrpcMethodMatcher(rule.operation.grpcServer.method);
                const serviceMatcher = createGrpcServiceMatcher(rule.operation.grpcServer.service);
                grpcServerRules.push({ methodMatcher, serviceMatcher, rule });
            } else if (rule.operation.grpcClient) {
                const methodMatcher = createGrpcMethodMatcher(rule.operation.grpcClient.method);
                const serviceMatcher = createGrpcServiceMatcher(rule.operation.grpcClient.service);
                const serverAddressMatcher = createServerAddressMatcher(rule.operation.grpcClient.serverAddress);
                grpcClientRules.push({ methodMatcher, serviceMatcher, serverAddressMatcher, rule });
            }
        }

        const dryRun = config.dryRun ?? false;

        logger.info("Parsed head sampling config", {
            noisyOperations: {
                numServiceRules: serviceRules.length,
                numHttpServerRules: httpServerRules.length,
                numHttpClientRules: httpClientRules.length,
                numGrpcServerRules: grpcServerRules.length,
                numGrpcClientRules: grpcClientRules.length,
            },
            dryRun,
        });

        return { serviceRules, httpServerRules, httpClientRules, grpcServerRules, grpcClientRules, dryRun };
    } catch (error) {
        logger.error('Error parsing head sampling config:', error);
        return { serviceRules: [], httpServerRules: [], httpClientRules: [], grpcServerRules: [], grpcClientRules: [], dryRun: false };
    }
}

export class OdigosScopedHeadSampler implements Sampler {

    // the parsed config for sampling, not filtered by scope.
    private readonly config: ParsedHeadSamplingConfig;

    // the operation kinds that are enabled for this scope.
    // this list will be populated based on the static config of each scope.
    // undefined means all operation kinds are enabled.
    // empty array means no operation kinds are enabled.
    private readonly enabledOperationKinds: HeadSamplingOperationKind[] | undefined;

    // logger for recording sampler events.
    private readonly logger: DiagLogger;

    // each tracer receives a sampler that is responsible for sampling traces for a specific scope.
    private readonly scopeName: string;

    constructor(config: ParsedHeadSamplingConfig, logger: DiagLogger, scopeName: string, enabledOperationKinds: HeadSamplingOperationKind[] | undefined) {
        this.config = config;
        this.enabledOperationKinds = enabledOperationKinds;
        this.logger = logger;
        this.scopeName = scopeName;
    }

    private isOperationKindEnabled(kind: HeadSamplingOperationKind): boolean {
        if (this.enabledOperationKinds === undefined) {
            return true;
        }
        return this.enabledOperationKinds.includes(kind);
    }

    shouldSample(context: Context, traceId: string, spanName: string, spanKind: SpanKind, attributes: Attributes, links: Link[]): SamplingResult {

        // service rules apply to the entire service, so we always add them to the matched rules.
        const matchedRules: NoisyOperationSamplingConfig[] = [...this.config.serviceRules];

        switch (spanKind) {
            case SpanKind.SERVER:
                if (this.isOperationKindEnabled(HeadSamplingOperationKind.Http)) {
                    matchedRules.push(...this.matchHttpServerRules(attributes));
                }
                if (this.isOperationKindEnabled(HeadSamplingOperationKind.Grpc)) {
                    matchedRules.push(...this.matchGrpcServerRules(attributes, spanName, this.scopeName));
                }
                break;
            case SpanKind.CLIENT:
                if (this.isOperationKindEnabled(HeadSamplingOperationKind.Http)) {
                    matchedRules.push(...this.matchHttpClientRules(attributes));
                }
                if (this.isOperationKindEnabled(HeadSamplingOperationKind.Grpc)) {
                    matchedRules.push(...this.matchGrpcClientRules(attributes, spanName, this.scopeName));
                }
                break;
        }

        // no rules matched, so we keep it.
        if (matchedRules.length === 0) {
            this.logger.debug("no head sampling rules matched for root span, keeping trace", {
                scopeName: this.scopeName,
                traceId,
                spanName,
                spanKind: spanKindToString(spanKind),
                attributes,
            });
            return { decision: SamplingDecision.RECORD_AND_SAMPLED };
        }

        // find the rule with minimum percentage, default if not set is 0
        const minPercentageRule = this.findMinPercentageRule(matchedRules);
        const keepPercentage = minPercentageRule.percentageAtMost ?? 0;
        const percentageTwoDecimalPlaces = Math.round(keepPercentage * 100) / 100;

        const decision = samplingDecisionByPercentage(traceId, keepPercentage);
        // c means category, n means noise.
        // dr means deciding rule, p means percentage, id means deciding rule id.
        // dry means dryrun
        const dryRunString = this.config.dryRun ? ';dry:' + (decision === SamplingDecision.RECORD_AND_SAMPLED ? 't' : 'f') : '';
        const traceStateString = `odigos=c:n;dr.p:${percentageTwoDecimalPlaces};dr.id:${minPercentageRule.id}${dryRunString}`;
        const traceState = createTraceState(traceStateString);

        this.logger.debug("head sampling rule matched for root span", {
            scopeName: this.scopeName,
            traceId,
            spanName,
            spanKind: spanKindToString(spanKind),
            attributes,
            decision,
            traceState,
        });
        
        // if dry run is enabled, do not drop the trace (but keep the trace state to record what would have happened)
        if (this.config.dryRun) {
            return { decision: SamplingDecision.RECORD_AND_SAMPLED, traceState };
        }

        return { decision, traceState };
    }

    private matchHttpServerRules(attributes: Attributes): NoisyOperationSamplingConfig[] {
        const parsed = parseHttpServerAttributes(attributes);
        if (!parsed) return [];

        const routeOrPath = parsed.route || parsed.path;
        if (!routeOrPath) return []; // http span mush have a route or a path.
        const segments = routeOrPath.split('/');

        const upperCaseMethod = parsed.method.toUpperCase();

        return this.config.httpServerRules
            .filter(parsedRule => parsedRule.methodMatcher.match(upperCaseMethod))
            .filter(parsedRule => parsedRule.pathMatcher.match(routeOrPath, segments))
            .map(parsedRule => parsedRule.rule);
    }

    private matchGrpcServerRules(attributes: Attributes, spanName: string, scopeName: string): NoisyOperationSamplingConfig[] {
        const parsed = parseGrpcAttributes(attributes, spanName, scopeName);
        if (!parsed) return [];

        return this.config.grpcServerRules
            .filter(parsedRule => parsedRule.methodMatcher.match(parsed.method))
            .filter(parsedRule => parsedRule.serviceMatcher.match(parsed.service))
            .map(parsedRule => parsedRule.rule);
    }

    private matchGrpcClientRules(attributes: Attributes, spanName: string, scopeName: string): NoisyOperationSamplingConfig[] {
        const parsed = parseGrpcAttributes(attributes, spanName, scopeName);
        if (!parsed) return [];

        // const lowerCaseServerAddress = getServerAddressFromAttributes(attributes)?.toLowerCase();

        return this.config.grpcClientRules
            .filter(parsedRule => parsedRule.methodMatcher.match(parsed.method))
            .filter(parsedRule => parsedRule.serviceMatcher.match(parsed.service))
            // .filter(parsedRule => !parsedRule.serverAddressMatcher || parsedRule.serverAddressMatcher.match(lowerCaseServerAddress))
            .map(parsedRule => parsedRule.rule);
    }

    private matchHttpClientRules(attributes: Attributes): NoisyOperationSamplingConfig[] {
        const parsed = parseHttpClientAttributes(attributes);
        if (!parsed) return [];

        const httpPath = parsed.templatedPath || parsed.path;
        if (!httpPath) return []; // http span mush have a path.
        const segments = httpPath.split('/');

        const upperCaseMethod = parsed.method.toUpperCase();
        const lowerCaseServerAddress = parsed.serverAddress?.toLowerCase();

        return this.config.httpClientRules
            .filter(parsedRule => parsedRule.methodMatcher.match(upperCaseMethod))
            .filter(parsedRule => !parsedRule.serverAddressMatcher || parsedRule.serverAddressMatcher.match(lowerCaseServerAddress))
            .filter(parsedRule => parsedRule.pathMatcher.match(httpPath, segments))
            .map(parsedRule => parsedRule.rule);
    }

    // givin all the head sampling rules that matched, find the rule with minimum percentage.
    // percentage undefined or 0 is considered as 0.
    findMinPercentageRule(rules: NoisyOperationSamplingConfig[]): NoisyOperationSamplingConfig {
        let minPercentage: NoisyOperationSamplingConfig | undefined = undefined;
        for (const rule of rules) {
            if (rule.percentageAtMost === undefined || rule.percentageAtMost === 0) {
                // early return if we hit the minimum percentage.
                return rule;
            }

            if (minPercentage === undefined) {
                // set first time
                minPercentage = rule;
            } else if (rule.percentageAtMost < minPercentage.percentageAtMost!) {
                // found a rule with lower percentage.
                minPercentage = rule;
            }
        }
        return minPercentage!;
    }

    toString(): string {
        return "OdigosHeadSampler";
    }

}
