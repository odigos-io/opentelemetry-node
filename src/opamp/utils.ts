import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { AttributeValue, Attributes } from "@opentelemetry/api";
import { type AnyValue, AnyValueSchema, type KeyValue, KeyValueSchema } from "./generated/anyvalue_pb";
import { ResourceAttributeFromServer } from "./opamp-types";
import { AgentToServerSchema } from "./generated/opamp_pb";
import { SdkHealthInfo } from "./types";

const attributeValueToAnyValue = (value: AttributeValue | undefined): AnyValue => {
    if (typeof value === 'string') {
        return create(AnyValueSchema, { value: { value: value, case: "stringValue" } });
    } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return create(AnyValueSchema, { value: { value: BigInt(value), case: "intValue" } });
        } else {
            return create(AnyValueSchema, { value: { value, case: "doubleValue" } });
        }
    } else if (typeof value === 'boolean') {
        return create(AnyValueSchema, { value: { value, case: "boolValue" } });
    } else if (Array.isArray(value)) {
        return create(AnyValueSchema, { value: { value: { values: value.map((v) => attributeValueToAnyValue(v ?? undefined)) }, case: "arrayValue" } });
    } else {
        // TODO: support this one day
        throw new Error(`Unsupported attribute value type: ${typeof value}`);
    }
}

export const otelAttributesToKeyValuePairs = (attributes?: Attributes): MessageInitShape<typeof KeyValueSchema>[] | undefined => {
    if (!attributes) {
        return undefined;
    }
    return Object.entries(attributes)
        .filter(([_, value]) => value !== undefined) // Filter out attributes with undefined values
        .map(([key, value]) => {
        return create(KeyValueSchema, {
            key,
            value: attributeValueToAnyValue(value),
        });
    });
};

export const sdkHealthInfoToOpampMessage = (sdkHealthInfo: SdkHealthInfo): MessageInitShape<typeof AgentToServerSchema> => {
    return {
        health: {
            healthy: !sdkHealthInfo.errorMessage,
            lastError: sdkHealthInfo.errorMessage,
            status: sdkHealthInfo.status,
          },  
    }
};