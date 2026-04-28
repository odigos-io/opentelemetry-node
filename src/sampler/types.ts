
// generic interface for matching http paths.

import { NoisyOperationSamplingConfig } from "../config";

// implementations can do it in different ways depending on the configuration.
export interface HttpPathMatcher {
    match(untemplatedPath: string, segments: string[]): boolean;
}

export interface HttpMethodMatcher {
    match(upperCaseMethod: string): boolean;
}

export interface HttpServerAddressMatcher {
    match(serverAddress: string | undefined): boolean;
}


// a raw rule contains just a path text. it is parsed to make matching streamlined and efficient.
// this struct is created per rule to make that happen
export type ParsedHttpRule = {
    pathMatcher: HttpPathMatcher;
    methodMatcher: HttpMethodMatcher;
    serverAddressMatcher?: HttpServerAddressMatcher;
    rule: NoisyOperationSamplingConfig;
}
