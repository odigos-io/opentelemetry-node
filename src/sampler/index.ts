import { Attributes, Context, createTraceState, Link, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult } from "@opentelemetry/sdk-trace-base";
import { HeadSamplingConfig, NoisyOperationSamplingConfig } from "../config";
import { matchHttpServerRule } from "./http-server";
import { matchHttpClientRule } from "./http-client";
import { parseHttpServerAttributes, parseHttpClientAttributes } from "./utils";
import { samplingDecisionByPercentage } from "./percentage";

export class OdigosHeadSampler implements Sampler {

    private serviceRules: NoisyOperationSamplingConfig[];
    private httpServerRules: NoisyOperationSamplingConfig[];
    private httpClientRules: NoisyOperationSamplingConfig[];

    constructor(config: HeadSamplingConfig) {
        this.serviceRules = [];
        this.httpServerRules = [];
        this.httpClientRules = [];

        for (const rule of config.noisyOperations) {
            if (rule.disabled) {
                continue;
            }

            if (!rule.operation) {
                this.serviceRules.push(rule);
            } else if (rule.operation.httpServer) {
                this.httpServerRules.push(rule);
            } else if (rule.operation.httpClient) {
                this.httpClientRules.push(rule);
            }
        }
    }

    shouldSample(context: Context, traceId: string, spanName: string, spanKind: SpanKind, attributes: Attributes, links: Link[]): SamplingResult {
        const matchedRules: NoisyOperationSamplingConfig[] = [];
        for (const rule of this.serviceRules) {
            matchedRules.push(rule);
        }

        switch (spanKind) {
            case SpanKind.SERVER:
                this.matchHttpServerRules(attributes, matchedRules);
                break;
            case SpanKind.CLIENT:
                this.matchHttpClientRules(attributes, matchedRules);
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
        const traceStateString = `odigos=c:n;dr.p:${percentageTwoDecimalPlaces};dr.id:${minPercentageRule.id}`;
        const traceState = createTraceState(traceStateString);
        return { decision, traceState };
    }

    private matchHttpServerRules(attributes: Attributes, matchedRules: NoisyOperationSamplingConfig[]): void {
        const parsed = parseHttpServerAttributes(attributes);
        if (!parsed) return;
        for (const rule of this.httpServerRules) {
            if (matchHttpServerRule(rule.operation!.httpServer!, parsed)) {
                matchedRules.push(rule);
            }
        }
    }

    private matchHttpClientRules(attributes: Attributes, matchedRules: NoisyOperationSamplingConfig[]): void {
        const parsed = parseHttpClientAttributes(attributes);
        if (!parsed) return;
        for (const rule of this.httpClientRules) {
            if (matchHttpClientRule(rule.operation!.httpClient!, parsed)) {
                matchedRules.push(rule);
            }
        }
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
