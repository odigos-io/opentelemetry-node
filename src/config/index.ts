
// Config for which id generation to use, and it's specific config options if any.
// only one of the id generation options can be specified.
// if none is specified, the default is to use the random id generator.
export interface IdGeneratorConfig {

    // random id generator is the default, and most common.
    // it creates span ids and trace ids using random bytes.
    random?: {},

    // trace id includes timestamp, source id byte, and random number bytes.
    // this id generator can be leveraged by databases to do efficient indexing.
    timedWall?: {
        // sourceId is a number between 0-255 (8 bits) written into the 8th byte of the trace id.
        // if timedWall is specified, the sourceId is required.
        sourceId: number;
    }
}

// configuration for the http headers collection.
export interface HeadersCollectionConfig {
    // only the keys in this list will be collected and added as attributes to the spans.
    httpHeaderKeys: string[];
}

export interface HeadSamplingOperationMatcher {
    httpServer?: HttpSamplingOperationMatcherServer;
    httpClient?: HttpSamplingOperationMatcherClient;
}

export interface HttpSamplingOperationMatcherServer {
    route?: string;
    routePrefix?: string;
    method?: string;
}

export interface HttpSamplingOperationMatcherClient {
    serverAddress?: string;
    templatedPath?: string;
    templatedPathPrefix?: string;
    method?: string;
}

export interface NoisyOperationSamplingConfig {
    id: string;
    name?: string;
    disabled?: boolean;
    operation?: HeadSamplingOperationMatcher;
    percentageAtMost?: number;
}

export interface HeadSamplingConfig {

	// If true, the sampling decision will be made in dry-run mode.
	// When dry-run is enabled, the sampling decision will be made but the trace will not be dropped.
	// This is useful to evaluate the sampling decision before actually committing to it.
    dryRun?: boolean;

    // configuration for the noisy operations.
    // if not specified, no noisy operations will be applied.
    noisyOperations: NoisyOperationSamplingConfig[];
}

export interface InstrumentationLibrary {

    // the programming language of the instrumentation library.
    // this should already be filtered to include only "javascript"
    programmingLanguage: string;

    // the name of the instrumentation library.
    libraryName: string;
}

// controls which spans should be included or excluded from a trace.
export interface TraceVerbosityConfig {
    // list of instrumentation libraries that should be disabled for this trace.
    disabledLibraries?: InstrumentationLibrary[];

    // list of instrumentation libraries that should be enabled for this trace.
    // used for opt-in instrumentation libraries that are disabled by default.
    enabledLibraries?: InstrumentationLibrary[];
}

export interface TracesConfig {
    // configuration for the traces.
    // it controls the trace and span ids used when starting a new trace or span.
    // if not specified, the default is to use the random id generator.
    idGenerator?: IdGeneratorConfig;

    // configuration for the http headers collection.
    // if not specified, no headers will be collected
    headersCollection?: HeadersCollectionConfig;

    // configuration for head sampling.
    // if not specified, no head sampling rules will be applied.
    headSampling?: HeadSamplingConfig;

    traceVerbosity?: TraceVerbosityConfig;
}

export interface ContainerConfig {
    // configuration for the traces.
    // null if traces should not be collected globally (regardless of any other configuration).
    traces?: TracesConfig;
}