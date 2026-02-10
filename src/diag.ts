import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";

// The support string -> DiagLogLevel mappings
const logLevelMap: { [key: string]: DiagLogLevel } = {
    ALL: DiagLogLevel.ALL,
    VERBOSE: DiagLogLevel.VERBOSE,
    DEBUG: DiagLogLevel.DEBUG,
    INFO: DiagLogLevel.INFO,
    WARN: DiagLogLevel.WARN,
    ERROR: DiagLogLevel.ERROR,
    NONE: DiagLogLevel.NONE,
};

const getOtelLogLevel = (): DiagLogLevel | undefined => {
    const otelLogLevel = process.env['OTEL_LOG_LEVEL'];
    if (!otelLogLevel) {
        return undefined;
    }
    return logLevelMap[otelLogLevel.toUpperCase()];
}

export const setOtelDiagLoggerToConsole = () => {
    const logLevel = getOtelLogLevel();
    if (!logLevel) {
        return;
    }
    diag.setLogger(new DiagConsoleLogger(), logLevel);
}
