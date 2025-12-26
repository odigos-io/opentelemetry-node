
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

export interface TracesConfig {
    // configuration for the traces.
    // it controls the trace and span ids used when starting a new trace or span.
    // if not specified, the default is to use the random id generator.
    idGenerator?: IdGeneratorConfig;

    // configuration for the http headers collection.
    // if not specified, no headers will be collected
    headersCollection?: HeadersCollectionConfig;
}

export interface ContainerConfig {
    // configuration for the traces.
    // null if traces should not be collected globally (regardless of any other configuration).
    traces?: TracesConfig;
}