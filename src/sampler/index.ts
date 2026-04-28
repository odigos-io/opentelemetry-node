import { Attributes, Context, createTraceState, Link, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult } from "@opentelemetry/sdk-trace-base";
import { HeadSamplingConfig, NoisyOperationSamplingConfig } from "../config";
import { parseHttpServerAttributes, parseHttpClientAttributes } from "./utils";
import { samplingDecisionByPercentage } from "./percentage";
import { ParsedHttpRule } from "./types";
import { createHttpMethodMatcher, createHttpPathMatcher, createHttpServerAddressMatcher } from "./path-matching";

export class OdigosHeadSampler implements Sampler {

    private serviceRules: NoisyOperationSamplingConfig[];
    private httpServerRules: ParsedHttpRule[];
    private httpClientRules: ParsedHttpRule[];
    private dryRun: boolean;

    constructor(config: HeadSamplingConfig) {
        this.serviceRules = [];
        const httpServerRules: ParsedHttpRule[] = [];
        const httpClientRules: ParsedHttpRule[] = [];

        for (const rule of config.noisyOperations) {
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
            }
        }
        this.httpServerRules = httpServerRules;
        this.httpClientRules = httpClientRules;
        this.dryRun = config.dryRun ?? false;
    }

    shouldSample(context: Context, traceId: string, spanName: string, spanKind: SpanKind, attributes: Attributes, links: Link[]): SamplingResult {

        // service rules apply to the entire service, so we always add them to the matched rules.
        const matchedRules: NoisyOperationSamplingConfig[] = [...this.serviceRules];

        switch (spanKind) {
            case SpanKind.SERVER:
                const serverRules = this.matchHttpServerRules(attributes);
                matchedRules.push(...serverRules);
                break;
            case SpanKind.CLIENT:
                const clientRules = this.matchHttpClientRules(attributes);
                matchedRules.push(...clientRules);
                break;
        }

        // no rules matched, so we keep it.
        if (matchedRules.length === 0) {
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
