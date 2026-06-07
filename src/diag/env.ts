import { DiagLogLevel } from "@opentelemetry/api";

export const ODIGOS_LOG_LEVEL = "ODIGOS_LOG_LEVEL";
export const OTEL_LOG_LEVEL = "OTEL_LOG_LEVEL";

const logLevelMap: { [key: string]: DiagLogLevel } = {
    ALL: DiagLogLevel.ALL,
    VERBOSE: DiagLogLevel.VERBOSE,
    DEBUG: DiagLogLevel.DEBUG,
    INFO: DiagLogLevel.INFO,
    WARN: DiagLogLevel.WARN,
    ERROR: DiagLogLevel.ERROR,
    NONE: DiagLogLevel.NONE,
};

export const logLevelFromEnvVar = (envVarName: string): DiagLogLevel => {
    if (!envVarName) {
        return DiagLogLevel.NONE;
    }
    const logLevel = process.env[envVarName];
    if (!logLevel) {
        return DiagLogLevel.NONE;
    }
    return logLevelMap[logLevel.toUpperCase()];
};
