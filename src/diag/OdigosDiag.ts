import {
    ComponentLoggerOptions,
    DiagConsoleLogger,
    DiagLogFunction,
    DiagLogLevel,
    DiagLogger,
} from "@opentelemetry/api";

export interface OdigosDiagLogger extends DiagLogger {
    createComponentLogger(options: ComponentLoggerOptions): DiagLogger;
}

const noopLogger: DiagLogger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    verbose: () => {},
};

const createLogLevelFilteredLogger = (
    maxLevel: DiagLogLevel,
    logger: DiagLogger
): DiagLogger => {
    const level =
        maxLevel < DiagLogLevel.NONE
            ? DiagLogLevel.NONE
            : maxLevel > DiagLogLevel.ALL
              ? DiagLogLevel.ALL
              : maxLevel;

    const filterFunc = (
        funcName: keyof DiagLogger,
        minLevel: DiagLogLevel
    ): DiagLogFunction => {
        const fn = logger[funcName];
        if (typeof fn === "function" && level >= minLevel) {
            return fn.bind(logger);
        }
        return () => {};
    };

    return {
        error: filterFunc("error", DiagLogLevel.ERROR),
        warn: filterFunc("warn", DiagLogLevel.WARN),
        info: filterFunc("info", DiagLogLevel.INFO),
        debug: filterFunc("debug", DiagLogLevel.DEBUG),
        verbose: filterFunc("verbose", DiagLogLevel.VERBOSE),
    };
};

class OdigosComponentLogger implements DiagLogger {
    constructor(
        private readonly namespace: string,
        private readonly logger: DiagLogger
    ) {}

    error: DiagLogFunction = (...args) =>
        this.logger.error(this.namespace, ...args);
    warn: DiagLogFunction = (...args) =>
        this.logger.warn(this.namespace, ...args);
    info: DiagLogFunction = (...args) =>
        this.logger.info(this.namespace, ...args);
    debug: DiagLogFunction = (...args) =>
        this.logger.debug(this.namespace, ...args);
    verbose: DiagLogFunction = (...args) =>
        this.logger.verbose(this.namespace, ...args);
}

export class OdigosDiag implements OdigosDiagLogger {
    private logger: DiagLogger;

    constructor(logLevel?: DiagLogLevel) {
        this.logger =
            logLevel === undefined || logLevel === DiagLogLevel.NONE
                ? noopLogger
                : createLogLevelFilteredLogger(
                      logLevel,
                      new DiagConsoleLogger()
                  );
    }

    createComponentLogger(options: ComponentLoggerOptions): DiagLogger {
        return new OdigosComponentLogger(options.namespace, this.logger);
    }

    error: DiagLogFunction = (...args) => this.logger.error(...args);
    warn: DiagLogFunction = (...args) => this.logger.warn(...args);
    info: DiagLogFunction = (...args) => this.logger.info(...args);
    debug: DiagLogFunction = (...args) => this.logger.debug(...args);
    verbose: DiagLogFunction = (...args) => this.logger.verbose(...args);
}
