import { HttpSamplingOperationMatcherClient } from "../config";
import {
    ParsedHttpClientAttributes,
    compareHttpMethod,
    comparePathToTemplate,
} from "./utils";

function matchTemplatedPath(parsed: ParsedHttpClientAttributes, ruleTemplatedPath: string | undefined, ruleTemplatedPathPrefix: string | undefined): boolean {
    if (!ruleTemplatedPath && !ruleTemplatedPathPrefix) {
        return true;
    }

    if (parsed.templatedPath) {
        return comparePathToTemplate(parsed.templatedPath, ruleTemplatedPath, ruleTemplatedPathPrefix);
    }

    // TODO: extract the path from either url.full or http.target attributes and compare to the rule.
    return false;
}

function matchServerAddress(spanServerAddress: string | undefined, ruleServerAddress: string): boolean {
    if (!spanServerAddress) {
        return false;
    }
    return spanServerAddress === ruleServerAddress;
}

export function matchHttpClientRule(matcherConfig: HttpSamplingOperationMatcherClient, parsed: ParsedHttpClientAttributes): boolean {
    if (matcherConfig.method && !compareHttpMethod(parsed.method, matcherConfig.method)) {
        return false;
    }

    if (matcherConfig.serverAddress && !matchServerAddress(parsed.serverAddress, matcherConfig.serverAddress)) {
        return false;
    }

    if ((matcherConfig.templatedPath || matcherConfig.templatedPathPrefix) &&
        !matchTemplatedPath(parsed, matcherConfig.templatedPath, matcherConfig.templatedPathPrefix)) {
        return false;
    }

    return true;
}
