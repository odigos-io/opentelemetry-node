import { RemoteConfig } from "../opamp";
import { Instrumentation, InstrumentationConfig } from "@opentelemetry/instrumentation";
import { PubSubInstrumentation } from "./googlepubsub/pubsub-instrumentation";
import type { DataloaderInstrumentationConfig } from "@opentelemetry/instrumentation-dataloader";
import type { ExpressInstrumentationConfig } from "@opentelemetry/instrumentation-express";
import type { FsInstrumentationConfig } from "@opentelemetry/instrumentation-fs";
import type { KnexInstrumentationConfig } from "@opentelemetry/instrumentation-knex";
import type { MongooseInstrumentationConfig } from "@opentelemetry/instrumentation-mongoose";
import type { PgInstrumentationConfig } from "@opentelemetry/instrumentation-pg";
import type { RedisInstrumentationConfig } from "@opentelemetry/instrumentation-redis";

import { getAllHeadersInstrumentationConfig, getHttpHeadersFromRemoteConfig, getSpecificHttpHeadersInstrumentationConfig, isCollectingAllHttpHeaders } from "./header-collection";
import { HeadSamplingOperationKind } from "../sampler/types";

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

    // if true, the instrumentation library is disabled by default.
    // can be enabled as opt-in by adding it to the enabledLibraries list in the traceVerbosity instrumentation rule.
    disabledByDefault?: boolean;

    // head sampling operation kinds this instrumentation scope should evaluate.
    // service-wide rules always apply regardless of this setting.
    // when undefined or omitted, all operation kinds are checked.
    // an empty array means do not check operations for this scope (not relevant for head sampling or not implemented).
    sampler?: HeadSamplingOperationKind[];
}

export function getHeadSamplingOperationKindsForScope(scopeName: string): HeadSamplingOperationKind[] | undefined {
    return instrumentationLibraryManifests.get(scopeName)?.sampler;
}

export const instrumentationLibraryManifests: Map<string, InstrumentationLibraryManifest> = new Map([
    ["@opentelemetry/instrumentation-amqplib", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-amqplib",
        import: "AmqplibInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-aws-sdk", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-aws-sdk",
        import: "AwsInstrumentation",
        sampler: [],
    }],
    ["@odigos/instrumentation-bunyan", {
        instrumentationNpmPackage: "@odigos/instrumentation-bunyan",
        import: "BunyanInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-cassandra-driver", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-cassandra-driver",
        import: "CassandraDriverInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-connect", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-connect",
        import: "ConnectInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-dataloader", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-dataloader",
        import: "DataloaderInstrumentation",
        config: {
            requireParentSpan: false,
        } as DataloaderInstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-dns", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-dns",
        import: "DnsInstrumentation",
        disabledByDefault: true,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-express", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-express",
        import: "ExpressInstrumentation",
        config: {
            ignoreLayers: ["middleware - expressInit", "middleware - query"], // added by default in express and give no real visibility value.
        } as ExpressInstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-fastify", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-fastify",
        import: "FastifyInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-fs", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-fs",
        import: "FsInstrumentation",
        disabledByDefault: true,
        config: {
            requireParentSpan: false,
        } as FsInstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-generic-pool", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-generic-pool",
        import: "GenericPoolInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-graphql", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-graphql",
        import: "GraphQLInstrumentation",
        config: {
            ignoreTrivialResolveSpans: true,
            mergeItems: true,
        } as InstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-grpc", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-grpc",
        import: "GrpcInstrumentation",
        sampler: [HeadSamplingOperationKind.Grpc],
    }],
    ["@opentelemetry/instrumentation-hapi", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-hapi",
        import: "HapiInstrumentation",
        sampler: [],
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
        sampler: [HeadSamplingOperationKind.Http],
    }],
    ["@opentelemetry/instrumentation-ioredis", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-ioredis",
        import: "IORedisInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-kafkajs", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-kafkajs",
        import: "KafkaJsInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-knex", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-knex",
        import: "KnexInstrumentation",
        config: {
            requireParentSpan: false,
        } as KnexInstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-koa", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-koa",
        import: "KoaInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-lru-memoizer", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-lru-memoizer",
        import: "LruMemoizerInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-memcached", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-memcached",
        import: "MemcachedInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-mongodb", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mongodb",
        import: "MongoDBInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-mongoose", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mongoose",
        import: "MongooseInstrumentation",
        config: {
            requireParentSpan: false,
        } as MongooseInstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-mysql2", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mysql2",
        import: "MySQL2Instrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-mysql", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-mysql",
        import: "MySQLInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-nestjs-core", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-nestjs-core",
        import: "NestInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-net", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-net",
        import: "NetInstrumentation",
        disabledByDefault: true,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-pg", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-pg",
        import: "PgInstrumentation",
        config: {
            requireParentSpan: false,
        } as PgInstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-pino", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-pino",
        import: "PinoInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-redis", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-redis",
        import: "RedisInstrumentation",
        config: {
            requireParentSpan: false,
        } as RedisInstrumentationConfig,
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-restify", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-restify",
        import: "RestifyInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-router", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-router",
        import: "RouterInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-socket.io", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-socket.io",
        import: "SocketIoInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-tedious", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-tedious",
        import: "TediousInstrumentation",
        sampler: [],
    }],
    ["@opentelemetry/instrumentation-undici", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-undici",
        import: "UndiciInstrumentation",
        sampler: [HeadSamplingOperationKind.Http],
    }],
    ["@opentelemetry/instrumentation-winston", {
        instrumentationNpmPackage: "@opentelemetry/instrumentation-winston",
        import: "WinstonInstrumentation",
        sampler: [],
    }],
    ["@odigos/instrumentation-gcp-pubsub", {
        instrumentationNpmPackage: "@odigos/instrumentation-gcp-pubsub",
        import: (config: InstrumentationConfig | undefined) => new PubSubInstrumentation(config),
        sampler: [],
    }],
]);
