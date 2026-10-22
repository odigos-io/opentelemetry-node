import { Attributes } from "@opentelemetry/api";
import { ATTR_HTTP_ROUTE, ATTR_HTTP_REQUEST_METHOD, ATTR_SERVER_ADDRESS, ATTR_URL_PATH, ATTR_URL_QUERY } from "@opentelemetry/semantic-conventions";
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_TARGET, SEMATTRS_HTTP_ROUTE, SEMATTRS_NET_PEER_NAME, SEMATTRS_RPC_SYSTEM } from "@opentelemetry/semantic-conventions";

const ATTR_URL_TEMPLATE = "url.template";

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

export const getHttpPathAndQueryParamsFromAttributes = (attributes: Attributes): { path: string, queryParams?: string } | undefined => {
    const pathNew = attributes[ATTR_URL_PATH];
    if (pathNew) {
        const path = pathNew.toString();
        const urlQuery = attributes[ATTR_URL_QUERY];
        const queryParams = urlQuery?.toString();
        return { path, queryParams };
    }

    const httpTargetLegacy = attributes[SEMATTRS_HTTP_TARGET];
    if (httpTargetLegacy) {
        const httpTarget = httpTargetLegacy.toString();
        if (httpTarget.includes('?')) {
            const [path, queryParams] = httpTarget.split('?');
            return { path, queryParams };
        } else {
            return { path: httpTarget };
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
    queryParams?: string;
}

export const parseHttpServerAttributes = (attributes: Attributes): ParsedHttpServerAttributes | undefined => {
    const method = getHttpMethodFromAttributes(attributes);
    if (!method) {
        return undefined;
    }
    const pathAndQueryParams = getHttpPathAndQueryParamsFromAttributes(attributes);
    return {
        method,
        route: getHttpRouteFromAttributes(attributes),
        path: pathAndQueryParams?.path,
        queryParams: pathAndQueryParams?.queryParams,
    };
}

export interface ParsedHttpClientAttributes {
    method: string;
    path?: string;
    templatedPath?: string;
    serverAddress?: string;
    queryParams?: string;
}

export const parseHttpClientAttributes = (attributes: Attributes): ParsedHttpClientAttributes | undefined => {
    const method = getHttpMethodFromAttributes(attributes);
    if (!method) {
        return undefined;
    }
    const pathAndQueryParams = getHttpPathAndQueryParamsFromAttributes(attributes);
    return {
        method,
        path: pathAndQueryParams?.path,
        queryParams: pathAndQueryParams?.queryParams,
        templatedPath: getHttpTemplatedPathFromAttributes(attributes),
        serverAddress: getServerAddressFromAttributes(attributes),
    };
}

export interface ParsedGrpcAttributes {
    method?: string;
    service?: string;
}

export const parseGrpcAttributes = (attributes: Attributes, spanName: string, scopeName: string): ParsedGrpcAttributes | undefined => {

    // due to a bug in the grpc instrumentation, the attributes are set after the span start,
    // which means they are not available in the head sampling.
    // until fixed upstream, we bypass by extracting the info from the span name.

    if (scopeName !== "@opentelemetry/instrumentation-grpc") {
        return undefined;
    }

    const spanNameParts = spanName.split('/');
    if (spanNameParts.length !== 2) {
        return undefined;
    }

    // grpc instrumentation adds a prefix of "grpc." to the span name before the service name.
    if (!spanNameParts[0].startsWith("grpc.")) {
        return undefined;
    }

    const service = spanNameParts[0].slice(5); // remove the "grpc." prefix
    const method = spanNameParts[1];
    return { method, service };
}

