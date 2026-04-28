import { HttpMethodMatcher, HttpPathMatcher, HttpServerAddressMatcher } from "./types";

// will return if a path segment should be compared using a wildcard match.
// - '*' means any path segment will match.
// - '{text}' means templated path segment will match any text.
// - ':text' means templated path segment will match any text.
const isWildcardMatch = (segment: string): boolean => {
    return segment === '*' || 
        (segment.startsWith('{') && segment.endsWith('}')) || 
        segment.startsWith(':');
}

class ParsedPathSegment {

    // if this path segment should be compared using a wildcard match, e.g. * or {text} or :text,
    // this will be true, and the matcher will be efficient.
    isWildcard?: boolean;

    // for exact match, this will be the exact string to match.
    exactMatch?: string;

    constructor(segmentMatchText: string) {
        if (isWildcardMatch(segmentMatchText)) {
            this.isWildcard = true;
        } else {
            this.exactMatch = segmentMatchText;
        }
    }

    public match(pathSegment: string): boolean {
        if (this.isWildcard) {
            return true;
        }
        return pathSegment === this.exactMatch;
    }
}

class HttpPathMatcherAlwaysTrue implements HttpPathMatcher {
    match(untemplatedPath: string, segments: string[]): boolean {
        return true;
    }
}

// match exact path, with no templatization, 
// for example: /api/v1/users
class HttpPathMatcherExact implements HttpPathMatcher {

    constructor(private exact: string) {}

    match(untemplatedPath: string, segments: string[]): boolean {
        return untemplatedPath === this.exact;
    }
} 

// match path prefix, with no templatization,
// for example: /api/v1 will match /api/v1/users
class HttpPathMatcherPrefix implements HttpPathMatcher {

    constructor(private prefix: string) {}

    match(untemplatedPath: string, segments: string[]): boolean {
        return untemplatedPath.startsWith(this.prefix);
    }
}

// match exact path, with templatization,
// for example: /api/v1/users/{user_id} will match /api/v1/users/123
class HttpTemplatizedPathMatcherExact implements HttpPathMatcher {

    private ruleParsedPathSegments: ParsedPathSegment[];

    constructor(private exact: string) {
        this.ruleParsedPathSegments = exact.split('/').map(segment => new ParsedPathSegment(segment));
    }

    match(untemplatedPath: string, segments: string[]): boolean {
        // for exact match, the number of segments must be the same.
        if (this.ruleParsedPathSegments.length !== segments.length) {
            return false;
        }

        for (let i = 0; i < this.ruleParsedPathSegments.length; i++) {
            if (!this.ruleParsedPathSegments[i].match(segments[i])) {
                return false;
            }
        }

        // none of segements above returned with false, so they all matche
        return true;
    }
}

// match path prefix, with templatization,
// for example: /api/v1/users/{user_id} will match /api/v1/users/123/posts/456
class HttpTemplatizedPathMatcherPrefix implements HttpPathMatcher {

    private ruleParsedPathSegments: ParsedPathSegment[];

    constructor(private prefix: string) {
        this.ruleParsedPathSegments = prefix.split('/').map(segment => new ParsedPathSegment(segment));
    }

    match(untemplatedPath: string, segments: string[]): boolean {
        // for prefix match, the number of segments must be greater than or equal to the number of segments in the rule.
        if (segments.length < this.ruleParsedPathSegments.length) {
            return false;
        }

        // for prefix match, each segment must match the corresponding segment in the rule.
        for (let i = 0; i < this.ruleParsedPathSegments.length; i++) {
            if (!this.ruleParsedPathSegments[i].match(segments[i])) {
                return false;
            }
        }
        // none of segements above returned with false, so they all matche
        return true;
    }
}

export const createHttpPathMatcher = (exactMatch: string | undefined, prefixMatch: string | undefined): HttpPathMatcher => {
    if (exactMatch) {
        const hasTemplatization = exactMatch.split('/').some(segment => isWildcardMatch(segment));
        if (hasTemplatization) {
            return new HttpTemplatizedPathMatcherExact(exactMatch);
        } else {
            return new HttpPathMatcherExact(exactMatch);
        }
    } else if (prefixMatch) {
        const hasTemplatization = prefixMatch.split('/').some(segment => isWildcardMatch(segment));
        if (hasTemplatization) {
            return new HttpTemplatizedPathMatcherPrefix(prefixMatch);
        } else {
            return new HttpPathMatcherPrefix(prefixMatch);
        }
    }
    return new HttpPathMatcherAlwaysTrue();
}

class HttpMethodMatcherExact implements HttpMethodMatcher {

    private upperCaseMethod: string | undefined;

    constructor(private method: string) {
        this.upperCaseMethod = method.toUpperCase();
    }

    match(upperCaseMethod: string): boolean {
        return this.upperCaseMethod === upperCaseMethod;
    }
}

class HttpMethodMatcherAlwaysTrue implements HttpMethodMatcher {
    match(upperCaseMethod: string): boolean {
        return true;
    }
}

export const createHttpMethodMatcher = (method: string | undefined): HttpMethodMatcher => {
    if (method) {
        return new HttpMethodMatcherExact(method);
    } else {
        return new HttpMethodMatcherAlwaysTrue();
    }
}


class HttpServerAddressMatcherExact implements HttpServerAddressMatcher {


    private lowerCaseServerAddress: string | undefined;

    constructor(private serverAddress: string) {
        this.lowerCaseServerAddress = serverAddress.toLowerCase();
    }

    match(serverAddressLowerCase: string | undefined): boolean {   
        if (!serverAddressLowerCase) {
            return false; // rule specify server address for match, but it is not present in the span.
        }
        return serverAddressLowerCase === this.lowerCaseServerAddress;
    }
}

class HttpServerAddressMatcherAlwaysTrue implements HttpServerAddressMatcher {
    match(serverAddressLowerCase: string): boolean {
        return true;
    }
}

export const createHttpServerAddressMatcher = (serverAddress: string | undefined): HttpServerAddressMatcher => {
    if (serverAddress) {
        return new HttpServerAddressMatcherExact(serverAddress);
    } else {
        return new HttpServerAddressMatcherAlwaysTrue();
    }
}
