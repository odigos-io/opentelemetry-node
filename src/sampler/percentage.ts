// Computes a deterministic trace percentage from a traceId using the
// OpenTelemetry consistent probability sampling algorithm.
// https://opentelemetry.io/docs/specs/otel/trace/tracestate-probability-sampling/#consistent-sampling-decision
//
// This is the same algorithm used by the OpenTelemetry Collector
// (github.com/open-telemetry/opentelemetry-collector-contrib/pkg/sampling),
// so both the SDK sampler and the Collector will derive the same percentage
// for a given traceId, producing consistent sampling decisions.

import { SamplingDecision } from "@opentelemetry/sdk-trace-base";

// 2^56 — the number of distinct randomness values (56 bits of entropy).
const MAX_ADJUSTED_COUNT = 2 ** 56;

// 56 bits = 7 bytes = 14 hex characters (bytes 9-15 of the TraceID).
const RANDOMNESS_HEX_DIGITS = 14;

/**
 * Derives a deterministic percentage in [0, 100] from a hex-encoded traceId.
 * Extracts 56 bits of randomness from the second half of the TraceID
 * (as specified by W3C Trace Context Level 2) and maps them linearly to [0, 100].
 */
function traceIdToPercentage(traceId: string): number {
    const randomnessHex = traceId.slice(-RANDOMNESS_HEX_DIGITS);
    // Precision loss for integers > 2^53 is negligible for a sampling percentage.
    const randomness = parseInt(randomnessHex, 16);
    return (randomness / MAX_ADJUSTED_COUNT) * 100;
}

/**
 * Returns a sampling decision by comparing the trace's deterministic percentage
 * against the configured rule percentage.
 */
export function samplingDecisionByPercentage(traceId: string, rulePercentage: number): SamplingDecision {
    const tracePercentage = traceIdToPercentage(traceId);
    return tracePercentage < rulePercentage
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD;
}
