import { DiagLogLevel, diag } from "@opentelemetry/api";
import { OdigosDiagConsoleLogger } from "./OdigosDiagConsoleLogger";
import { OdigosDiag } from "./OdigosDiag";
import { logLevelFromEnvVar, ODIGOS_LOG_LEVEL, OTEL_LOG_LEVEL } from "./env";

export { OdigosDiag } from "./OdigosDiag";
export type { OdigosDiagLogger } from "./OdigosDiag";

export const createOdigosDiag = (): OdigosDiag => {
    const logLevel = logLevelFromEnvVar(ODIGOS_LOG_LEVEL);
    const logger = new OdigosDiagConsoleLogger();
    return new OdigosDiag(logLevel, logger);
};

export const createAndRegisterOtelDiag = (): OdigosDiag => {
    const logLevel = logLevelFromEnvVar(OTEL_LOG_LEVEL);
    const logger = new OdigosDiagConsoleLogger();
    const odigosDynamicLevelWrapper = new OdigosDiag(logLevel, logger);

    // we filter dynamically in the odigos wrapper based on the config,
    // thus, when registering, we set the log level to all to ensure all messages
    // arrives to our filter
    diag.setLogger(odigosDynamicLevelWrapper, DiagLogLevel.ALL);
    return odigosDynamicLevelWrapper;
};
