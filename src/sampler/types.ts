
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

// gRPC matchers. Case-sensitive exact match on the bare method and fully-qualified service.
// Empty rule fields are wildcards; absent span attributes cause a rule with a constraint on
// that attribute to miss.
export interface GrpcMethodMatcher {
    match(method: string | undefined): boolean;
}

export interface GrpcServiceMatcher {
    match(service: string | undefined): boolean;
}

export type ParsedGrpcRule = {
    methodMatcher: GrpcMethodMatcher;
    serviceMatcher: GrpcServiceMatcher;
    // server address is optional (client-only).
    serverAddressMatcher?: HttpServerAddressMatcher;
    rule: NoisyOperationSamplingConfig;
}
