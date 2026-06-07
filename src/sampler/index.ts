import { Attributes, Context, createTraceState, DiagLogger, Link, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult } from "@opentelemetry/sdk-trace-base";
import { HeadSamplingConfig, NoisyOperationSamplingConfig } from "../config";
import { parseHttpServerAttributes, parseHttpClientAttributes, parseGrpcServerAttributes, parseGrpcClientAttributes } from "./utils";
import { samplingDecisionByPercentage } from "./percentage";
import { ParsedGrpcRule, ParsedHttpRule } from "./types";
import { createHttpMethodMatcher, createHttpPathMatcher, createHttpServerAddressMatcher } from "./path-matching";
import { createGrpcMethodMatcher, createGrpcServiceMatcher } from "./grpc-matching";

const spanKindToString = (spanKind: SpanKind): string => {
    return SpanKind[spanKind] ?? String(spanKind);
}

export class OdigosHeadSampler implements Sampler {

    private serviceRules: NoisyOperationSamplingConfig[];
    private httpServerRules: ParsedHttpRule[] = [];
    private httpClientRules: ParsedHttpRule[] = [];
    private grpcServerRules: ParsedGrpcRule[] = [];
    private grpcClientRules: ParsedGrpcRule[] = [];
    private dryRun: boolean = false;
    private readonly logger: DiagLogger;

    constructor(config: HeadSamplingConfig, logger: DiagLogger) {
        this.logger = logger;
        this.serviceRules = [];
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
                    this.serviceRules.push(rule);
                } else if (rule.operation.httpServer) {
                    const pathMatcher = createHttpPathMatcher(rule.operation.httpServer.route, rule.operation.httpServer.routePrefix);
                    const methodMatcher = createHttpMethodMatcher(rule.operation.httpServer.method);
                    httpServerRules.push({ pathMatcher, methodMatcher, rule });
                } else if (rule.operation.httpClient) {
                    const pathMatcher = createHttpPathMatcher(rule.operation.httpClient.templatedPath, rule.operation.httpClient.templatedPathPrefix);
                    const methodMatcher = createHttpMethodMatcher(rule.operation.httpClient.method);
                    const serverAddressMatcher = createHttpServerAddressMatcher(rule.operation.httpClient.serverAddress);
                    httpClientRules.push({ pathMatcher, methodMatcher, serverAddressMatcher, rule });
                } else if (rule.operation.grpcServer) {
                    const methodMatcher = createGrpcMethodMatcher(rule.operation.grpcServer.method);
                    const serviceMatcher = createGrpcServiceMatcher(rule.operation.grpcServer.service);
                    grpcServerRules.push({ methodMatcher, serviceMatcher, rule });
                } else if (rule.operation.grpcClient) {
                    const methodMatcher = createGrpcMethodMatcher(rule.operation.grpcClient.method);
                    const serviceMatcher = createGrpcServiceMatcher(rule.operation.grpcClient.service);
                    const serverAddressMatcher = createHttpServerAddressMatcher(rule.operation.grpcClient.serverAddress);
                    grpcClientRules.push({ methodMatcher, serviceMatcher, serverAddressMatcher, rule });
                }
            }

            this.httpServerRules = httpServerRules;
            this.httpClientRules = httpClientRules;
            this.grpcServerRules = grpcServerRules;
            this.grpcClientRules = grpcClientRules;
            this.dryRun = config.dryRun ?? false;

            this.logger.info("Initialized OdigosHeadSampler", {
                noisyOperations: {
                    numServiceRules: this.serviceRules.length,
                    numHttpServerRules: this.httpServerRules.length,
                    numHttpClientRules: this.httpClientRules.length,
                    numGrpcServerRules: this.grpcServerRules.length,
                    numGrpcClientRules: this.grpcClientRules.length,
                },
                dryRun: this.dryRun,
            });

        } catch (error) {
            this.logger.error('Error initializing OdigosHeadSampler:', error);
        }
    }

    shouldSample(context: Context, traceId: string, spanName: string, spanKind: SpanKind, attributes: Attributes, links: Link[]): SamplingResult {

        // service rules apply to the entire service, so we always add them to the matched rules.
        const matchedRules: NoisyOperationSamplingConfig[] = [...this.serviceRules];

        // HTTP and gRPC rules can coexist on SERVER/CLIENT spans; each matcher self-gates by
        // attribute presence (HTTP needs http.* / url.*, gRPC needs rpc.* + rpc.system != non-grpc),
        // so we evaluate both and let the rule definitions decide which actually applies.
        switch (spanKind) {
            case SpanKind.SERVER:
                matchedRules.push(...this.matchHttpServerRules(attributes));
                matchedRules.push(...this.matchGrpcServerRules(attributes));
                break;
            case SpanKind.CLIENT:
                matchedRules.push(...this.matchHttpClientRules(attributes));
                matchedRules.push(...this.matchGrpcClientRules(attributes));
                break;
        }

        // no rules matched, so we keep it.
        if (matchedRules.length === 0) {
            this.logger.debug("no head sampling rules matched for root span, keeping trace", {
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
        const dryRunString = this.dryRun ? ';dry:' + (decision === SamplingDecision.RECORD_AND_SAMPLED ? 't' : 'f') : '';
        const traceStateString = `odigos=c:n;dr.p:${percentageTwoDecimalPlaces};dr.id:${minPercentageRule.id}${dryRunString}`;
        const traceState = createTraceState(traceStateString);

        this.logger.debug("head sampling rule matched for root span", {
            traceId,
            spanName,
            spanKind: spanKindToString(spanKind),
            attributes,
            decision,
            traceState,
        });

        // if dry run is enabled, do not drop the trace (but keep the trace state to record what would have happened)
        if (this.dryRun) {
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

        return this.httpServerRules
            .filter(parsedRule => parsedRule.methodMatcher.match(upperCaseMethod))
            .filter(parsedRule => parsedRule.pathMatcher.match(routeOrPath, segments))
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

        return this.httpClientRules
            .filter(parsedRule => parsedRule.methodMatcher.match(upperCaseMethod))
            .filter(parsedRule => !parsedRule.serverAddressMatcher || parsedRule.serverAddressMatcher.match(lowerCaseServerAddress))
            .filter(parsedRule => parsedRule.pathMatcher.match(httpPath, segments))
            .map(parsedRule => parsedRule.rule);
    }

    private matchGrpcServerRules(attributes: Attributes): NoisyOperationSamplingConfig[] {
        console.log("attributes", {attributes});
        if (this.grpcServerRules.length === 0) return [];
        const parsed = parseGrpcServerAttributes(attributes);
        console.log("parsed", {parsed,attributes});
        if (!parsed) return [];

        return this.grpcServerRules
            .filter(parsedRule => parsedRule.serviceMatcher.match(parsed.service))
            .filter(parsedRule => parsedRule.methodMatcher.match(parsed.method))
            .map(parsedRule => parsedRule.rule);
    }

    private matchGrpcClientRules(attributes: Attributes): NoisyOperationSamplingConfig[] {
        console.log("attributes", {attributes});
        if (this.grpcClientRules.length === 0) return [];
        const parsed = parseGrpcClientAttributes(attributes);
        console.log("parsed", {parsed,attributes});
        if (!parsed) return [];

        // server.address comparison reuses the HTTP server-address matcher (case-insensitive
        // exact match), so we lowercase here for consistency with that matcher's contract.
        const lowerCaseServerAddress = parsed.serverAddress?.toLowerCase();

        return this.grpcClientRules
            .filter(parsedRule => parsedRule.serviceMatcher.match(parsed.service))
            .filter(parsedRule => parsedRule.methodMatcher.match(parsed.method))
            .filter(parsedRule => !parsedRule.serverAddressMatcher || parsedRule.serverAddressMatcher.match(lowerCaseServerAddress))
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
