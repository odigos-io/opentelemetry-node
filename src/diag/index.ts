import { DiagConsoleLogger, diag } from "@opentelemetry/api";
import { OdigosDiag } from "./OdigosDiag";
import { logLevelFromEnvVar, ODIGOS_LOG_LEVEL, OTEL_LOG_LEVEL } from "./env";

export { OdigosDiag } from "./OdigosDiag";
export type { OdigosDiagLogger } from "./OdigosDiag";

export const createOdigosDiag = (): OdigosDiag => {
    return new OdigosDiag(logLevelFromEnvVar(ODIGOS_LOG_LEVEL));
};

export const setOtelDiagLoggerToConsole = (): void => {
    const logLevel = logLevelFromEnvVar(OTEL_LOG_LEVEL);
    if (!logLevel) {
        return;
    }
    diag.setLogger(new DiagConsoleLogger(), logLevel);
};
