import { Instrumentation } from "@opentelemetry/instrumentation";
import { diag } from "@opentelemetry/api";

const instrumentations = [
  ["@opentelemetry/instrumentation-amqplib", "AmqplibInstrumentation"],
  ["@opentelemetry/instrumentation-aws-sdk", "AwsInstrumentation"],
  ["@opentelemetry/instrumentation-bunyan", "BunyanInstrumentation"],
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
  ["@opentelemetry/instrumentation-graphql", "GraphQLInstrumentation"],
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

const safeRequire = (
  npmPackageName: string,
  importName: string
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
    const instrumentation = new instrumentationClass();
    return instrumentation;
  } catch (e) {
    diag.error("Failed to require and instantiate an instrumentation class", {
      npmPackageName,
      importName,
    });
    return undefined;
  }
};

export const getNodeAutoInstrumentations = (): Instrumentation[] => {
  return instrumentations
    .map(([npmPackageName, importName]) =>
      safeRequire(npmPackageName, importName)
    )
    .filter((instrumentations) => !!instrumentations);
};
