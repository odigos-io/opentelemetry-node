import { Attributes, Context, Link, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { AttributeCondition, AttributesAndSamplerRule, HeadSamplingConfig } from "../config";

// AttributesAndSamplerRuleWithSampler mirrors AttributesAndSamplerRule but uses a sampler instead of fraction
export interface AttributesAndSamplerRuleWithSampler {
    attributeConditions: AttributeCondition[];
    sampler: TraceIdRatioBasedSampler;
}

// HeadSamplingConfigWithSamplers mirrors HeadSamplingConfig but uses samplers instead of fractions
export interface HeadSamplingConfigWithSamplers {
    attributesAndSamplerRules: AttributesAndSamplerRuleWithSampler[];
    fallbackSampler: TraceIdRatioBasedSampler;
}

export class OdigosHeadSampler implements Sampler {

    private config: HeadSamplingConfigWithSamplers;

    constructor(config: HeadSamplingConfig) {
        // Convert config with fractions to config with samplers
        this.config = {
            attributesAndSamplerRules: config.attributesAndSamplerRules.map(rule => ({
                attributeConditions: rule.attributeConditions,
                sampler: new TraceIdRatioBasedSampler(rule.fraction)
            })),
            fallbackSampler: new TraceIdRatioBasedSampler(config.fallbackFraction)
        };
    }

    shouldSample(context: Context, traceId: string, spanName: string, spanKind: SpanKind, attributes: Attributes, links: Link[]): SamplingResult {

        // Evaluate rules based on the config
        for (const rule of this.config.attributesAndSamplerRules) {
            if (rule.attributeConditions.every(condition => this.evaluateRuleCondition(attributes, condition))) {
                // Use the sampler for this rule
                return rule.sampler.shouldSample(context, traceId);
            }
        }

        // Use fallback sampler if no rules match
        return this.config.fallbackSampler.shouldSample(context, traceId);
    }

    toString(): string {
        return "OdigosHeadSampler";
    }

    private evaluateRules(attributes: Attributes, rule: AttributesAndSamplerRuleWithSampler): SamplingDecision | undefined {
        if (rule.attributeConditions.every(condition => this.evaluateRuleCondition(attributes, condition))) {
            return SamplingDecision.RECORD_AND_SAMPLED;
        }
        return undefined;
    }

    private evaluateRuleCondition(attributes: Attributes, condition: AttributeCondition): boolean {
        const value = attributes[condition.key];
        if (!value) {
            return false;
        }
        if (typeof value !== "string") {
            return false;
        }
        switch (condition.operator) {
            case "equals":
                return value === condition.val;
            case "notEquals":
                return value !== condition.val;
            case "endWith":
                return value.endsWith(condition.val);
            case "startWith":
                return value.startsWith(condition.val);
        }
        return false;
    }

}
