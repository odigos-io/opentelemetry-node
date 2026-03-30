import { Attributes, Context, Link, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { HeadSamplingConfig } from "../config";

export class OdigosHeadSampler implements Sampler {


    constructor(config: HeadSamplingConfig) {
    }

    shouldSample(context: Context, traceId: string, spanName: string, spanKind: SpanKind, attributes: Attributes, links: Link[]): SamplingResult {
        return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    toString(): string {
        return "OdigosHeadSampler";
    }

}
