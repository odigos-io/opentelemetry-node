import { Attributes } from "@opentelemetry/api";
import { ATTR_HTTP_ROUTE, ATTR_HTTP_REQUEST_METHOD, ATTR_SERVER_ADDRESS, ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_TARGET, SEMATTRS_HTTP_ROUTE, SEMATTRS_NET_PEER_NAME, SEMATTRS_RPC_METHOD, SEMATTRS_RPC_SERVICE, SEMATTRS_RPC_SYSTEM } from "@opentelemetry/semantic-conventions";

const ATTR_URL_TEMPLATE = "url.template";

// rpc.system.name is the newer (release-candidate) attribute that supersedes rpc.system.
// It isn't exported by @opentelemetry/semantic-conventions v1.25 yet; we use the literal string.
const ATTR_RPC_SYSTEM_NAME = "rpc.system.name";

// Well-known value of rpc.system / rpc.system.name for gRPC, identical across both semconv
// generations. The matcher compares case-insensitively to tolerate sloppy emitters.
export const RPC_SYSTEM_VALUE_GRPC = "grpc";

export const getHttpMethodFromAttributes = (attributes: Attributes): string | undefined => {
    const methodNew = attributes[ATTR_HTTP_REQUEST_METHOD];
    if (methodNew) {
        return methodNew.toString();
    }

    const methodOld = attributes[SEMATTRS_HTTP_METHOD];
    if (methodOld) {
        return methodOld.toString();
    }

    return undefined;
}

export const getHttpRouteFromAttributes = (attributes: Attributes): string | undefined => {
    const route = attributes[ATTR_HTTP_ROUTE];
    if (route) {
        return route.toString();
    }

    const routeOld = attributes[SEMATTRS_HTTP_ROUTE];
    if (routeOld) {
        return routeOld.toString();
    }

    return undefined;
}

export const getHttpPathFromAttributes = (attributes: Attributes): string | undefined => {
    const pathNew = attributes[ATTR_URL_PATH];
    if (pathNew) {
        return pathNew.toString();
    }

    const httpTargetLegacy = attributes[SEMATTRS_HTTP_TARGET];
    if (httpTargetLegacy) {
        const httpTarget = httpTargetLegacy.toString();
        if (httpTarget.includes('?')) {
            return httpTarget.split('?')[0];
        } else {
            return httpTarget;
        }
    }

    return undefined;
}

export const getHttpTemplatedPathFromAttributes = (attributes: Attributes): string | undefined => {
    const urlTemplate = attributes[ATTR_URL_TEMPLATE];
    if (urlTemplate) {
        return urlTemplate.toString();
    }

    return undefined;
}

export const getServerAddressFromAttributes = (attributes: Attributes): string | undefined => {
    const serverAddress = attributes[ATTR_SERVER_ADDRESS];
    if (serverAddress) {
        return serverAddress.toString();
    }

    const netPeerName = attributes[SEMATTRS_NET_PEER_NAME];
    if (netPeerName) {
        return netPeerName.toString();
    }

    return undefined;
}

export interface ParsedHttpServerAttributes {
    method: string;
    route?: string;
    path?: string;
}

export const parseHttpServerAttributes = (attributes: Attributes): ParsedHttpServerAttributes | undefined => {
    const method = getHttpMethodFromAttributes(attributes);
    if (!method) {
        return undefined;
    }
    return {
        method,
        route: getHttpRouteFromAttributes(attributes),
        path: getHttpPathFromAttributes(attributes),
    };
}

export interface ParsedHttpClientAttributes {
    method: string;
    path?: string;
    templatedPath?: string;
    serverAddress?: string;
}

export const parseHttpClientAttributes = (attributes: Attributes): ParsedHttpClientAttributes | undefined => {
    const method = getHttpMethodFromAttributes(attributes);
    if (!method) {
        return undefined;
    }
    return {
        method,
        path: getHttpPathFromAttributes(attributes),
        templatedPath: getHttpTemplatedPathFromAttributes(attributes),
        serverAddress: getServerAddressFromAttributes(attributes),
    };
}

// rpc.system / rpc.system.name identifies the RPC framework. We check the newer (RC)
// attribute first since it is the current spec key. Returns undefined when neither is present.
export const getRpcSystemFromAttributes = (attributes: Attributes): string | undefined => {
    const systemNew = attributes[ATTR_RPC_SYSTEM_NAME];
    if (systemNew !== undefined) {
        return systemNew.toString();
    }
    const systemOld = attributes[SEMATTRS_RPC_SYSTEM];
    if (systemOld !== undefined) {
        return systemOld.toString();
    }
    return undefined;
}

// Returns the bare gRPC method name from a span, handling both OTel semconv conventions:
//   - older split convention: rpc.method already carries just the bare method (e.g. "ListItems").
//   - newer fully-qualified convention: rpc.method is "Service/method"
//     (e.g. "acme.inventory.v1.InventoryService/ListItems"); we return the part after the "/".
// The split is applied only when both sides of "/" are non-empty, so sentinel values like
// "_OTHER" and degenerate forms like "/foo" / "foo/" are returned as-is.
export const getRpcMethodFromAttributes = (attributes: Attributes): string | undefined => {
    const raw = attributes[SEMATTRS_RPC_METHOD];
    if (raw === undefined) {
        return undefined;
    }
    const value = raw.toString();
    const slashIndex = value.indexOf('/');
    if (slashIndex > 0 && slashIndex < value.length - 1) {
        return value.slice(slashIndex + 1);
    }
    return value;
}

// Returns the fully-qualified gRPC service name from a span, handling both OTel semconv conventions:
//   - older split convention: read rpc.service directly.
//   - newer fully-qualified convention: rpc.service is deprecated and the service is encoded as
//     the prefix of rpc.method ("Service/method"); when rpc.service is absent we extract it from
//     the part before the "/".
export const getRpcServiceFromAttributes = (attributes: Attributes): string | undefined => {
    const rpcService = attributes[SEMATTRS_RPC_SERVICE];
    if (rpcService !== undefined) {
        return rpcService.toString();
    }
    const rpcMethod = attributes[SEMATTRS_RPC_METHOD];
    if (rpcMethod === undefined) {
        return undefined;
    }
    const value = rpcMethod.toString();
    const slashIndex = value.indexOf('/');
    if (slashIndex > 0 && slashIndex < value.length - 1) {
        return value.slice(0, slashIndex);
    }
    return undefined;
}

export interface ParsedGrpcAttributes {
    method?: string;
    service?: string;
    serverAddress?: string;
}

// Parses a span as a gRPC span. Returns undefined when the span is provably not gRPC, i.e.:
//   - rpc.system / rpc.system.name is present and not "grpc" (case-insensitive) — another RPC
//     framework (Apache Dubbo, Connect RPC, JSON-RPC, .NET WCF, Java RMI, ONC RPC) sharing the
//     rpc.* namespace.
//   - neither rpc.method nor rpc.service can be derived from the span — not an RPC span at all.
// Spans that omit rpc.system entirely are still considered (permissive default for older
// instrumentations); only the rpc.method / rpc.service presence check gates them.
const parseGrpcAttributes = (attributes: Attributes): ParsedGrpcAttributes | undefined => {
    const rpcSystem = getRpcSystemFromAttributes(attributes);
    if (rpcSystem !== undefined && rpcSystem.toLowerCase() !== RPC_SYSTEM_VALUE_GRPC) {
        return undefined;
    }
    const method = getRpcMethodFromAttributes(attributes);
    const service = getRpcServiceFromAttributes(attributes);
    if (method === undefined && service === undefined) {
        return undefined;
    }
    return { method, service };
}

export const parseGrpcServerAttributes = (attributes: Attributes): ParsedGrpcAttributes | undefined => {
    return parseGrpcAttributes(attributes);
}

export const parseGrpcClientAttributes = (attributes: Attributes): ParsedGrpcAttributes | undefined => {
    const parsed = parseGrpcAttributes(attributes);
    if (!parsed) {
        return undefined;
    }
    return {
        ...parsed,
        serverAddress: getServerAddressFromAttributes(attributes),
    };
}

