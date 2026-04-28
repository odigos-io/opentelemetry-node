import { Attributes } from "@opentelemetry/api";
import { ATTR_HTTP_ROUTE, ATTR_HTTP_REQUEST_METHOD, ATTR_SERVER_ADDRESS, ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_TARGET, SEMATTRS_HTTP_ROUTE, SEMATTRS_NET_PEER_NAME } from "@opentelemetry/semantic-conventions";

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

