
// Config for which id generation to use, and it's specific config options if any.
// only one of the id generation options can be specified.
// if none is specified, the default is to use the random id generator.
export interface IdGeneratorConfig {

    // random id generator is the default, and most common.
    // it creates span ids and trace ids using random bytes.
    random?: {},

    // trace id includes timestamp, source id byte, and random number bytes.
    // this id generator can be leveraged by databases to do efficient indexing.
    timedWall?: {
        // sourceId is a number between 0-255 (8 bits) written into the 8th byte of the trace id.
        // if timedWall is specified, the sourceId is required.
        sourceId: number;
    }
}

// configuration for the http headers collection.
export interface HeadersCollectionConfig {
    // only the keys in this list will be collected and added as attributes to the spans.
    httpHeaderKeys: string[];
}

// Operator represents the operator to use to compare the attribute value.
export type Operator = "equals" | "notEquals" | "endWith" | "startWith";

// AttributeCondition represents the attributes and values that an operator acts upon in an expression.
export interface AttributeCondition {
    // attribute key (e.g. "url.path")
    key: string;
    // currently only string values are supported.
    val: string;
    // The operator to use to compare the attribute value.
    // Defaults to "equals" if not specified.
    operator?: Operator;
}

// AttributesAndSamplerRule is a set of AttributeCondition that are ANDed together.
// If all attribute conditions evaluate to true, the AND sampler evaluates to true,
// and the fraction is used to determine the sampling decision.
// If any of the attribute compare samplers evaluate to false,
// the fraction is not used and the rule is skipped.
// An "empty" AttributesAndSamplerRule with no attribute conditions is considered to always evaluate to true,
// and the fraction is used to determine the sampling decision.
// This entity is referred to as a rule in Odigos terminology for head-sampling.
export interface AttributesAndSamplerRule {
    attributeConditions: AttributeCondition[];
    // The fraction of spans to sample, in the range [0, 1].
    // If the fraction is 0, no spans are sampled.
    // If the fraction is 1, all spans are sampled.
    // Defaults to 1 if not specified.
    fraction: number;
}

// HeadSamplingConfig is a set of attribute rules.
// The first attribute rule that evaluates to true is used to determine the sampling decision based on its fraction.
//
// If none of the rules evaluate to true, the fallback fraction is used to determine the sampling decision.
export interface HeadSamplingConfig {
    attributesAndSamplerRules: AttributesAndSamplerRule[];
    // Used as a fallback if all rules evaluate to false.
    // It may be empty - in this case the default value will be 1 - all spans are sampled.
    // It should be a float value in the range [0, 1] - the fraction of spans to sample.
    // A value of 0 means no spans are sampled if none of the rules evaluate to true.
    // Defaults to 1 if not specified.
    fallbackFraction: number;
}

export interface TracesConfig {
    // configuration for the traces.
    // it controls the trace and span ids used when starting a new trace or span.
    // if not specified, the default is to use the random id generator.
    idGenerator?: IdGeneratorConfig;

    // configuration for the http headers collection.
    // if not specified, no headers will be collected
    headersCollection?: HeadersCollectionConfig;

    // configuration for head sampling.
    // if not specified, no head sampling rules will be applied.
    headSampling?: HeadSamplingConfig;
}

export interface ContainerConfig {
    // configuration for the traces.
    // null if traces should not be collected globally (regardless of any other configuration).
    traces?: TracesConfig;
}