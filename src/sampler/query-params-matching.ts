import { HttpQueryParamMatcher } from "../config";
import { HttpQueryParamsMatcher } from "./types";

class HttpQueryParamsMatcherAlwaysTrue implements HttpQueryParamsMatcher {
    match(_queryParams: string | undefined): boolean {
        return true;
    }
}

class SingleQueryParamMatcher {
    constructor(private name: string, private valueExact: string | undefined) {}

    match(parsedParams: URLSearchParams): boolean {
        const values = parsedParams.getAll(this.name);
        if (values.length === 0) {
            return false;
        }
        if (this.valueExact === undefined) {
            return true;
        }
        return values.some(value => value === this.valueExact);
    }
}

class HttpQueryParamsMatcherComposite implements HttpQueryParamsMatcher {
    private matchers: SingleQueryParamMatcher[];

    constructor(queryParams: HttpQueryParamMatcher[]) {
        this.matchers = queryParams.map(
            queryParam => new SingleQueryParamMatcher(queryParam.name, queryParam.valueExact),
        );
    }

    match(queryParams: string | undefined): boolean {
        if (queryParams === undefined || queryParams === '') {
            return false;
        }
        const parsedParams = new URLSearchParams(queryParams);
        return this.matchers.every(matcher => matcher.match(parsedParams));
    }
}

export const createHttpQueryParamsMatcher = (queryParams: HttpQueryParamMatcher[] | undefined): HttpQueryParamsMatcher => {
    if (!queryParams || queryParams.length === 0) {
        return new HttpQueryParamsMatcherAlwaysTrue();
    }
    return new HttpQueryParamsMatcherComposite(queryParams);
}
