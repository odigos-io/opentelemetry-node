import { Span } from "@opentelemetry/api";
import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface PubSubMessageHookInfo {
    data: Buffer;
}

export interface PubSubCustomAttributesFunction {
    (span: Span, info: PubSubMessageHookInfo): void;
}

export interface PubSubInstrumentationConfig extends InstrumentationConfig {

    // hook that is called before publishing a message and allows to add custom attributes to the span
    onPublishMessageHook?: PubSubCustomAttributesFunction;

    // hook that is called before processing a message and allows to add custom attributes to the span
    onProcessMessageHook?: PubSubCustomAttributesFunction;
}