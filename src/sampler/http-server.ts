import { HttpSamplingOperationMatcherServer } from "../config";
import {
    ParsedHttpServerAttributes,
    compareHttpMethod,
    compareHttpRoute,
    comparePathToTemplate,
} from "./utils";

function matchHttpRoute(parsed: ParsedHttpServerAttributes, ruleRouteExact: string | undefined, ruleRoutePrefix: string | undefined ): boolean {
    if (!ruleRouteExact && !ruleRoutePrefix) {
        return true;
    }

    if (parsed.route) {
        return compareHttpRoute(parsed.route, ruleRouteExact, ruleRoutePrefix);
    }

    if (parsed.path) {
        return comparePathToTemplate(parsed.path, ruleRouteExact, ruleRoutePrefix);
    }

    return false;
}

export function matchHttpServerRule(matcherConfig: HttpSamplingOperationMatcherServer, parsed: ParsedHttpServerAttributes): boolean {
    if (matcherConfig.method && !compareHttpMethod(parsed.method, matcherConfig.method)) {
        return false;
    }

    if ((matcherConfig.route || matcherConfig.routePrefix) &&
        !matchHttpRoute(parsed, matcherConfig.route, matcherConfig.routePrefix)) {
        return false;
    }

    return true;
}
