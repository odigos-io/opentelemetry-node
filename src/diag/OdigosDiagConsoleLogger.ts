import util from "util";
import type { DiagLogger, DiagLogFunction } from "@opentelemetry/api";

type ConsoleMapKeys = "error" | "warn" | "info" | "debug" | "trace";

const consoleMap: { n: keyof DiagLogger; c: ConsoleMapKeys; label: string }[] =
    [
        { n: "error", c: "error", label: "ERROR" },
        { n: "warn", c: "warn", label: "WARN" },
        { n: "info", c: "info", label: "INFO" },
        { n: "debug", c: "debug", label: "DEBUG" },
        { n: "verbose", c: "trace", label: "VERBOSE" },
    ];

const INSPECT_OPTIONS: util.InspectOptions = {
    depth: 5,
    colors: true,
    breakLength: 120,
};

const originalConsoleMethods: Partial<
    Record<ConsoleMapKeys | "log", typeof console.log>
> = {};
if (typeof console !== "undefined") {
    const keys: (ConsoleMapKeys | "log")[] = [
        "error",
        "warn",
        "info",
        "debug",
        "trace",
        "log",
    ];
    for (const key of keys) {
        if (typeof console[key] === "function") {
            originalConsoleMethods[key] = console[key];
        }
    }
}

const formatArg = (arg: unknown): unknown => {
    if (arg === null || typeof arg !== "object") {
        return arg;
    }
    return util.inspect(arg, INSPECT_OPTIONS);
};

const formatArgs = (args: unknown[]): unknown[] => args.map(formatArg);

export class OdigosDiagConsoleLogger implements DiagLogger {
    constructor() {
        const consoleFunc = (
            funcName: ConsoleMapKeys,
            levelLabel: string
        ): DiagLogFunction => {
            return function (...args) {
                let theFunc = originalConsoleMethods[funcName];
                if (typeof theFunc !== "function") {
                    theFunc = originalConsoleMethods["log"];
                }
                if (typeof theFunc !== "function" && console) {
                    theFunc = console[funcName];
                    if (typeof theFunc !== "function") {
                        theFunc = console.log;
                    }
                }
                if (typeof theFunc === "function") {
                    return theFunc.apply(console, [
                        `[${levelLabel}]`,
                        ...formatArgs(args),
                    ]);
                }
            };
        };

        for (let i = 0; i < consoleMap.length; i++) {
            const { n, c, label } = consoleMap[i];
            this[n] = consoleFunc(c, label);
        }
    }

    public error!: DiagLogFunction;
    public warn!: DiagLogFunction;
    public info!: DiagLogFunction;
    public debug!: DiagLogFunction;
    public verbose!: DiagLogFunction;
}
