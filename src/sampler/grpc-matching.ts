import { GrpcMethodMatcher, GrpcServiceMatcher } from "./types";

// Exact, case-sensitive match on the bare gRPC method name (e.g. "ListItems").
// gRPC method names follow proto naming conventions and are inherently case-sensitive.
// If the span has no rpc.method (and the rule sets a non-empty method), the rule must miss —
// hence the explicit undefined check that returns false rather than treating undefined as match.
class GrpcMethodMatcherExact implements GrpcMethodMatcher {
    constructor(private readonly method: string) {}

    match(spanMethod: string | undefined): boolean {
        if (spanMethod === undefined) {
            return false;
        }
        return spanMethod === this.method;
    }
}

class GrpcMethodMatcherAlwaysTrue implements GrpcMethodMatcher {
    match(_spanMethod: string | undefined): boolean {
        return true;
    }
}

export const createGrpcMethodMatcher = (method: string | undefined): GrpcMethodMatcher => {
    if (method) {
        return new GrpcMethodMatcherExact(method);
    }
    return new GrpcMethodMatcherAlwaysTrue();
}

// Exact, case-sensitive match on the fully-qualified gRPC service name (e.g.
// "acme.inventory.v1.InventoryService"). The service may include a package prefix
// separated by dots; it never contains a "/" (the "/" delimits service from method
// in the wire format, and the matcher receives the already-split service part).
class GrpcServiceMatcherExact implements GrpcServiceMatcher {
    constructor(private readonly service: string) {}

    match(spanService: string | undefined): boolean {
        if (spanService === undefined) {
            return false;
        }
        return spanService === this.service;
    }
}

class GrpcServiceMatcherAlwaysTrue implements GrpcServiceMatcher {
    match(_spanService: string | undefined): boolean {
        return true;
    }
}

export const createGrpcServiceMatcher = (service: string | undefined): GrpcServiceMatcher => {
    if (service) {
        return new GrpcServiceMatcherExact(service);
    }
    return new GrpcServiceMatcherAlwaysTrue();
}
