import {
    ComponentLoggerOptions,
    DiagLogFunction,
    DiagLogLevel,
    DiagLogger,
} from "@opentelemetry/api";
import { AgentLogLevel } from "../config";

export interface OdigosDiagLogger extends DiagLogger {
    createComponentLogger(options: ComponentLoggerOptions): DiagLogger;
    updateConfig(configLogLevel?: AgentLogLevel): void;
}

const agentLogLevelMap: Record<AgentLogLevel, DiagLogLevel> = {
    error: DiagLogLevel.ERROR,
    warn: DiagLogLevel.WARN,
    info: DiagLogLevel.INFO,
    debug: DiagLogLevel.DEBUG,
};

const agentLogLevelToDiagLogLevel = (
    logLevel?: AgentLogLevel
): DiagLogLevel => {
    if (!logLevel) {
        return DiagLogLevel.NONE;
    }
    return agentLogLevelMap[logLevel];
};

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
        private readonly getLogger: () => DiagLogger
    ) {}

    error: DiagLogFunction = (...args) =>
        this.getLogger().error(this.namespace, ...args);
    warn: DiagLogFunction = (...args) =>
        this.getLogger().warn(this.namespace, ...args);
    info: DiagLogFunction = (...args) =>
        this.getLogger().info(this.namespace, ...args);
    debug: DiagLogFunction = (...args) =>
        this.getLogger().debug(this.namespace, ...args);
    verbose: DiagLogFunction = (...args) =>
        this.getLogger().verbose(this.namespace, ...args);
}

export class OdigosDiag implements OdigosDiagLogger {
    private logger: DiagLogger = noopLogger;
    private outputLogger: DiagLogger;

    constructor(logLevel: DiagLogLevel, logger: DiagLogger) {
        this.outputLogger = logger;
        this.setLogLevel(logLevel, logger);
    }

    private setLogLevel(logLevel: DiagLogLevel, logger: DiagLogger): void {
        if (logLevel === DiagLogLevel.NONE) {
            this.logger = noopLogger;
        } else {
            this.logger = createLogLevelFilteredLogger(logLevel, logger);
        }
    }

    updateConfig(configLogLevel?: AgentLogLevel): void {
        this.setLogLevel(agentLogLevelToDiagLogLevel(configLogLevel), this.outputLogger);
    }

    createComponentLogger(options: ComponentLoggerOptions): DiagLogger {
        return new OdigosComponentLogger(options.namespace, () => this.logger);
    }

    error: DiagLogFunction = (...args) => this.logger.error(...args);
    warn: DiagLogFunction = (...args) => this.logger.warn(...args);
    info: DiagLogFunction = (...args) => this.logger.info(...args);
    debug: DiagLogFunction = (...args) => this.logger.debug(...args);
    verbose: DiagLogFunction = (...args) => this.logger.verbose(...args);
}
