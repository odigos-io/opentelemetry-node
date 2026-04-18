import { RemoteConfig } from "../opamp";
import { Instrumentation, InstrumentationConfig } from "@opentelemetry/instrumentation";
import { PubSubInstrumentation } from "./googlepubsub/pubsub-instrumentation";

import { getAllHeadersInstrumentationConfig, getHttpHeadersFromRemoteConfig, getSpecificHttpHeadersInstrumentationConfig, isCollectingAllHttpHeaders } from "./header-collection";

export type InstrumentationLibraryConfigFunction = (libraryName: string, agentConfig: RemoteConfig | undefined, currentInstrumentationConfig: InstrumentationConfig | undefined) => InstrumentationConfig;

export type InstrumentationFactory = (config: InstrumentationConfig | undefined) => Instrumentation;

export interface InstrumentationLibraryManifest {

    // the name of the npm package that should be imported to get the instrumentation class
    instrumentationNpmPackage: string;

    // the name of the class to import from the npm package
    // or a function that imports the instrumentation class and returns it
    import: string | InstrumentationFactory;

    // if the instrumentation has a config, it will be passed to the constructor of the instrumentation class
    // and also be used during the remote config update
    config?: InstrumentationConfig | InstrumentationLibraryConfigFunction;
}

export const instrumentationLibraryManifests: Map<string, InstrumentationLibraryManifest> = new Map([
    ["@opentelemetry/instrumentation-amqplib", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-amqplib",
        import: "AmqplibInstrumentation",
    }],
    ["@opentelemetry/instrumentation-aws-sdk", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-aws-sdk",
        import: "AwsInstrumentation",
    }],
    ["@odigos/instrumentation-bunyan", {
        instrumentationNpmPackage: "@odigos/instrumentation-bunyan",
        import: "BunyanInstrumentation",
    }],
    ["@opentelemetry/instrumentation-cassandra-driver", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-cassandra-driver",
        import: "CassandraDriverInstrumentation",
    }],
    ["@opentelemetry/instrumentation-connect", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-connect",
        import: "ConnectInstrumentation",
    }],
    ["@opentelemetry/instrumentation-dataloader", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-dataloader",
        import: "DataloaderInstrumentation",
    }],
    // ["@opentelemetry/instrumentation-dns", {
    //     instrumentationNpmPackage: "@opentelemetry/instrumentation-dns",
    //     import: "DnsInstrumentation",
    // }],
    ["@opentelemetry/instrumentation-express", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-express",
        import: "ExpressInstrumentation",
    }],
    ["@opentelemetry/instrumentation-fastify", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-fastify",
        import: "FastifyInstrumentation",
    }],
    // ["@opentelemetry/instrumentation-fs", {
    //     instrumentationNpmPackage: "@opentelemetry/instrumentation-fs",
    //     import: "FsInstrumentation",
    // }],
    ["@opentelemetry/instrumentation-generic-pool", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-generic-pool",
        import: "GenericPoolInstrumentation",
    }],
    ["@opentelemetry/instrumentation-graphql", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-graphql",
        import: "GraphQLInstrumentation",
        config: {
            ignoreTrivialResolveSpans: true,
            mergeItems: true,
        } as InstrumentationConfig,
    }],
    ["@opentelemetry/instrumentation-grpc", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-grpc",
        import: "GrpcInstrumentation",
    }],
    ["@opentelemetry/instrumentation-hapi", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-hapi",
        import: "HapiInstrumentation",
    }],
    ["@opentelemetry/instrumentation-http", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-http",
        import: "HttpInstrumentation",
        config: (_: string, config: RemoteConfig | undefined): InstrumentationConfig => {
            const headerKeys = getHttpHeadersFromRemoteConfig(config);
            if (!headerKeys || headerKeys.length === 0) {
                return {};
            }
       
            const isCollectingAllHeaders = isCollectingAllHttpHeaders(headerKeys);
            if (isCollectingAllHeaders) {
                return getAllHeadersInstrumentationConfig();
            } else {
                return getSpecificHttpHeadersInstrumentationConfig(headerKeys);
            }
        },
    }],
    ["@opentelemetry/instrumentation-ioredis", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-ioredis",
        import: "IORedisInstrumentation",
    }],
    ["@opentelemetry/instrumentation-kafkajs", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-kafkajs",
        import: "KafkaJsInstrumentation",
    }],
    ["@opentelemetry/instrumentation-knex", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-knex",
        import: "KnexInstrumentation",
    }],
    ["@opentelemetry/instrumentation-koa", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-koa",
        import: "KoaInstrumentation",
    }],
    ["@opentelemetry/instrumentation-lru-memoizer", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-lru-memoizer",
        import: "LruMemoizerInstrumentation",
    }],
    ["@opentelemetry/instrumentation-memcached", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-memcached",
        import: "MemcachedInstrumentation",
    }],
    ["@opentelemetry/instrumentation-mongodb", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mongodb",
        import: "MongoDBInstrumentation",
    }],
    ["@opentelemetry/instrumentation-mongoose", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mongoose",
        import: "MongooseInstrumentation",
    }],
    ["@opentelemetry/instrumentation-mysql2", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mysql2",
        import: "MySQL2Instrumentation",
    }],
    ["@opentelemetry/instrumentation-mysql", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mysql",
        import: "MySQLInstrumentation",
    }],
    ["@opentelemetry/instrumentation-nestjs-core", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-nestjs-core",
        import: "NestInstrumentation",
    }],
    ["@opentelemetry/instrumentation-pg", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-pg",
        import: "PgInstrumentation",
    }],
    ["@opentelemetry/instrumentation-pino", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-pino",
        import: "PinoInstrumentation",
    }],
    ["@opentelemetry/instrumentation-redis", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-redis",
        import: "RedisInstrumentation",
    }],
    ["@opentelemetry/instrumentation-restify", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-restify",
        import: "RestifyInstrumentation",
    }],
    ["@opentelemetry/instrumentation-router", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-router",
        import: "RouterInstrumentation",
    }],
    ["@opentelemetry/instrumentation-socket.io", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-socket.io",
        import: "SocketIoInstrumentation",
    }],
    ["@opentelemetry/instrumentation-tedious", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-tedious",
        import: "TediousInstrumentation",
    }],
    ["@opentelemetry/instrumentation-undici", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-undici",
        import: "UndiciInstrumentation",
    }],
    ["@opentelemetry/instrumentation-winston", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-winston",
        import: "WinstonInstrumentation",
    }],
    ["@odigos/instrumentation-gcp-pubsub", {
        instrumentationNpmPackage: "@odigos/instrumentation-gcp-pubsub",
        import: (config: InstrumentationConfig | undefined) => new PubSubInstrumentation(config),
    }],
]);
