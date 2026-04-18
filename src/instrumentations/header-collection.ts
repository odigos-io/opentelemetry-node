import { HttpInstrumentationConfig } from "@opentelemetry/instrumentation-http";
import { RemoteConfig } from "../opamp";
import { Span } from "@opentelemetry/api";
import { ClientRequest, IncomingMessage, ServerResponse } from "http";

export const getHttpHeadersFromRemoteConfig = (remoteConfig: RemoteConfig | undefined): string[] | undefined => {
    return remoteConfig?.containerConfig?.traces?.headersCollection?.httpHeaderKeys;
}

export const isCollectingAllHttpHeaders = (headerKeys: string[] | undefined): boolean => {
    return Array.isArray(headerKeys) && headerKeys.some((k) => k === "*");
}

export const getSpecificHttpHeadersInstrumentationConfig = (headerKeys: string[]): HttpInstrumentationConfig => {
    return {
        headersToSpanAttributes: {
            server: {
                requestHeaders: headerKeys,
                responseHeaders: headerKeys,
            },
            client: {
                requestHeaders: headerKeys,
                responseHeaders: headerKeys,
            },
        },
    } as HttpInstrumentationConfig;
}

type GetHeader = (name: string) => number | string | string[] | undefined;

const recordHttpHeaders = (span: Span, type: 'request' | 'response', headerNames: string[], getHeader: GetHeader) => {
    for (const name of headerNames) {
        const value = getHeader(name);
        if (value) {
            const key = `http.${type}.headers.${name.toLowerCase()}`;
            if (typeof value === 'string') {
                span.setAttribute(key, [value]);
            } else if (Array.isArray(value)) {
                span.setAttribute(key, value);
            } else {
                span.setAttribute(key, [value]);
            }
        }
    }
}

export const getAllHeadersInstrumentationConfig = (): HttpInstrumentationConfig => {
    return {
        applyCustomAttributesOnSpan: (span: Span, request: ClientRequest | IncomingMessage, response: IncomingMessage | ServerResponse) => {
            
            if (request instanceof ClientRequest) {
                recordHttpHeaders(span, 'request', request.getHeaderNames(), (name) => request.getHeader(name));
            } else if (request instanceof IncomingMessage) {
                recordHttpHeaders(span, 'request', Object.keys(request.headers), (name) => request.headers[name]);
            }

            if (response instanceof ServerResponse) {
                recordHttpHeaders(span, 'response', response.getHeaderNames(), (name) => response.getHeader(name));
            } else if (response instanceof IncomingMessage) {
                recordHttpHeaders(span, 'response', Object.keys(response.headers), (name) => response.headers[name]);
            }
        }
    } as HttpInstrumentationConfig;
}
