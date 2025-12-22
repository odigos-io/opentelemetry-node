import { Instrumentation } from "@opentelemetry/instrumentation";
import { diag } from "@opentelemetry/api";
import { PubSubInstrumentation } from "./instrumentations/pubsub-instrumentation";

const instrumentations: [string, string, any?][] = [
  ["@opentelemetry/instrumentation-amqplib", "AmqplibInstrumentation"],
  ["@opentelemetry/instrumentation-aws-sdk", "AwsInstrumentation"],
  ["@odigos/instrumentation-bunyan", "BunyanInstrumentation"],
  [
    "@opentelemetry/instrumentation-cassandra-driver",
    "CassandraDriverInstrumentation",
  ],
  ["@opentelemetry/instrumentation-connect", "ConnectInstrumentation"],
  ["@opentelemetry/instrumentation-dataloader", "DataloaderInstrumentation"],
  ["@opentelemetry/instrumentation-dns", "DnsInstrumentation"],
  ["@opentelemetry/instrumentation-express", "ExpressInstrumentation"],
  ["@opentelemetry/instrumentation-fastify", "FastifyInstrumentation"],
  ["@opentelemetry/instrumentation-fs", "FsInstrumentation"],
  ["@opentelemetry/instrumentation-generic-pool", "GenericPoolInstrumentation"],
  ["@opentelemetry/instrumentation-graphql", "GraphQLInstrumentation", {
    // graphql instrumentation will create a lot of spans by default.
    // some of them are just trivial resolvers like getting a string value as a property of an object.
    // they are way too verbose and we don't need them.
    // this option will remove those trivial resolver spans.
    ignoreTrivialResolveSpans: true, 

    // show list resolver as a single span to reduce the number of spans
    mergeItems: true,
  }],
  ["@opentelemetry/instrumentation-grpc", "GrpcInstrumentation"],
  ["@opentelemetry/instrumentation-hapi", "HapiInstrumentation"],
  ["@opentelemetry/instrumentation-http", "HttpInstrumentation"],
  ["@opentelemetry/instrumentation-ioredis", "IORedisInstrumentation"],
  ["@opentelemetry/instrumentation-kafkajs", "KafkaJsInstrumentation"],
  ["@opentelemetry/instrumentation-knex", "KnexInstrumentation"],
  ["@opentelemetry/instrumentation-koa", "KoaInstrumentation"],
  ["@opentelemetry/instrumentation-lru-memoizer", "LruMemoizerInstrumentation"],
  ["@opentelemetry/instrumentation-memcached", "MemcachedInstrumentation"],
  ["@opentelemetry/instrumentation-mongodb", "MongoDBInstrumentation"],
  ["@opentelemetry/instrumentation-mongoose", "MongooseInstrumentation"],
  ["@opentelemetry/instrumentation-mysql2", "MySQL2Instrumentation"],
  ["@opentelemetry/instrumentation-mysql", "MySQLInstrumentation"],
  ["@opentelemetry/instrumentation-nestjs-core", "NestInstrumentation"],
  ["@opentelemetry/instrumentation-net", "NetInstrumentation"],
  ["@opentelemetry/instrumentation-pg", "PgInstrumentation"],
  ["@opentelemetry/instrumentation-pino", "PinoInstrumentation"],
  ["@opentelemetry/instrumentation-redis", "RedisInstrumentation"],
  ["@opentelemetry/instrumentation-redis-4", "RedisInstrumentation"],
  ["@opentelemetry/instrumentation-restify", "RestifyInstrumentation"],
  ["@opentelemetry/instrumentation-router", "RouterInstrumentation"],
  ["@opentelemetry/instrumentation-socket.io", "SocketIoInstrumentation"],
  ["@opentelemetry/instrumentation-tedious", "TediousInstrumentation"],
  ["@opentelemetry/instrumentation-undici", "UndiciInstrumentation"],
  ["@opentelemetry/instrumentation-winston", "WinstonInstrumentation"],
];

const safeCreateInstrumentationLibrary = (
  npmPackageName: string,
  importName: string,
  instrumentationConfig: any
): Instrumentation | undefined => {
  try {
    const moduleExports = require(npmPackageName);
    const instrumentationClass = moduleExports[importName];
    if (!instrumentationClass) {
      diag.warn(
        "Failed to require instrumentation class. this might be ok for EOF node versions",
        { npmPackageName, importName }
      );
      return undefined;
    }
    const instrumentation = new instrumentationClass(instrumentationConfig);
    return instrumentation;
  } catch (e) {
    diag.error("Failed to require and instantiate an instrumentation class", {
      npmPackageName,
      importName,
    });
    return undefined;
  }
};

const getDisabledInstrumentations = (): Set<string> => {
  const disabledInstrumentationsEnv = process.env.ODIGOS_DISABLED_INSTRUMENTATION_LIBRARIES;
  const disabledInstrumentations = disabledInstrumentationsEnv ? disabledInstrumentationsEnv.split(",") : [];
  const normalizedDisabledInstrumentations =  disabledInstrumentations
    .flatMap((instrumentation) => {
      if (instrumentation.startsWith("@opentelemetry/instrumentation-") || instrumentation.startsWith("@odigos/instrumentation-")) {
        return [instrumentation];
      } else {
        // support disabling both community and odigos-prefixed names
        return [
          `@opentelemetry/instrumentation-${instrumentation}`,
          `@odigos/instrumentation-${instrumentation}`,
        ];
      }
    });

  return new Set(normalizedDisabledInstrumentations);
};

export const getNodeAutoInstrumentations = (): Instrumentation[] => {
  const disabledInstrumentations = getDisabledInstrumentations();
  const list = instrumentations
    .filter(([npmPackageName]) => !disabledInstrumentations.has(npmPackageName))
    .map(([npmPackageName, importName, config]) =>
      safeCreateInstrumentationLibrary(npmPackageName, importName, config)
    )
    .filter((instrumentations) => !!instrumentations);
  // Add Odigos Pub/Sub instrumentation unless explicitly disabled
  if (!disabledInstrumentations.has("@odigos/instrumentation-gcp-pubsub") &&
      !disabledInstrumentations.has("@opentelemetry/instrumentation-gcp-pubsub") &&
      !disabledInstrumentations.has("@opentelemetry/instrumentation-pubsub")) {
    try {
      list.push(new PubSubInstrumentation());
    } catch (e) {
      diag.error("Failed to initialize PubSubInstrumentation", e as any);
    }
  }
  return list as unknown as Instrumentation[];
};
