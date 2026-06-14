/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modified by Odigos Authors to also read ODIGOS_RESOURCE_ATTRIBUTES.
 */

import type { Attributes } from "@opentelemetry/api";
import { diag } from "@opentelemetry/api";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type {
  DetectedResource,
  ResourceDetectionConfig,
  ResourceDetector,
} from "@opentelemetry/resources";
import { getStringFromEnv } from "@opentelemetry/core";

export const OTEL_RESOURCE_ATTRIBUTES = "OTEL_RESOURCE_ATTRIBUTES";
export const ODIGOS_RESOURCE_ATTRIBUTES = "ODIGOS_RESOURCE_ATTRIBUTES";

/**
 * EnvDetector can be used to detect the presence of and create a Resource
 * from the OTEL_RESOURCE_ATTRIBUTES and ODIGOS_RESOURCE_ATTRIBUTES environment variables.
 */
class OdigosEnvDetector implements ResourceDetector {
  // Type, attribute keys, and attribute values should not exceed 256 characters.
  private readonly _MAX_LENGTH = 255;

  // OTEL_RESOURCE_ATTRIBUTES is a comma-separated list of attributes.
  private readonly _COMMA_SEPARATOR = ",";

  // OTEL_RESOURCE_ATTRIBUTES contains key value pair separated by '='.
  private readonly _LABEL_KEY_VALUE_SPLITTER = "=";

  /**
   * Returns a {@link Resource} populated with attributes from the
   * OTEL_RESOURCE_ATTRIBUTES and ODIGOS_RESOURCE_ATTRIBUTES environment variables.
   *
   * @param config The resource detection config
   */
  detect(_config?: ResourceDetectionConfig): DetectedResource {
    const attributes: Attributes = {};

    Object.assign(
      attributes,
      this._tryParseResourceAttributesFromEnv(OTEL_RESOURCE_ATTRIBUTES),
    );
    Object.assign(
      attributes,
      this._tryParseResourceAttributesFromEnv(ODIGOS_RESOURCE_ATTRIBUTES),
    );

    const serviceName = getStringFromEnv("OTEL_SERVICE_NAME");
    if (serviceName) {
      attributes[ATTR_SERVICE_NAME] = serviceName;
    }

    return { attributes };
  }

  private _tryParseResourceAttributesFromEnv(envVarName: string): Attributes {
    const rawAttributes = getStringFromEnv(envVarName);
    if (!rawAttributes) {
      return {};
    }

    try {
      return this._parseResourceAttributes(rawAttributes);
    } catch (e) {
      diag.debug(
        `EnvDetector failed parsing ${envVarName}: ${e instanceof Error ? e.message : e}`,
      );
      return {};
    }
  }

  /**
   * Creates an attribute map from a comma-separated resource attributes
   * environment variable value.
   *
   * The value is a comma-separated list of attributes in the format
   * "key1=value1,key2=value2". The ',' and '=' characters in keys and values
   * MUST be percent-encoded. Other characters MAY be percent-encoded.
   *
   * Per the spec, on any error (e.g., decoding failure), the entire environment
   * variable value is discarded.
   */
  private _parseResourceAttributes(rawEnvAttributes?: string): Attributes {
    if (!rawEnvAttributes) return {};

    const attributes: Attributes = {};
    const rawAttributes: string[] = rawEnvAttributes
      .split(this._COMMA_SEPARATOR)
      .filter((attr) => attr.trim() !== "");

    for (const rawAttribute of rawAttributes) {
      const keyValuePair: string[] = rawAttribute.split(
        this._LABEL_KEY_VALUE_SPLITTER,
      );

      if (keyValuePair.length !== 2) {
        throw new Error(
          `Invalid format for resource attributes: "${rawAttribute}". ` +
            `Expected format: key=value. The ',' and '=' characters must be percent-encoded in keys and values.`,
        );
      }

      const [rawKey, rawValue] = keyValuePair;
      const key = rawKey.trim();
      const value = rawValue.trim();

      if (key.length === 0) {
        throw new Error(
          `Invalid resource attributes: empty attribute key in "${rawAttribute}".`,
        );
      }

      let decodedKey: string;
      let decodedValue: string;
      try {
        decodedKey = decodeURIComponent(key);
        decodedValue = decodeURIComponent(value);
      } catch (e) {
        throw new Error(
          `Failed to percent-decode resource attributes entry "${rawAttribute}": ${e instanceof Error ? e.message : e}`,
        );
      }

      if (decodedKey.length > this._MAX_LENGTH) {
        throw new Error(
          `Attribute key exceeds the maximum length of ${this._MAX_LENGTH} characters: "${decodedKey}".`,
        );
      }

      if (decodedValue.length > this._MAX_LENGTH) {
        throw new Error(
          `Attribute value exceeds the maximum length of ${this._MAX_LENGTH} characters for key "${decodedKey}".`,
        );
      }

      attributes[decodedKey] = decodedValue;
    }

    return attributes;
  }
}

export const odigosEnvDetector = new OdigosEnvDetector();
