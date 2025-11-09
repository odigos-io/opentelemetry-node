import { IdGenerator, RandomIdGenerator } from "@opentelemetry/sdk-trace-base";
import { TimedWallIdGenerator } from "./timedwall";
import { IdGeneratorConfig } from "../config";
import { randomIdGenerator } from "./random";

export const idGeneratorFromConfig = (config?: IdGeneratorConfig): IdGenerator => {
    if (config?.timedWall) {
        return new TimedWallIdGenerator(config.timedWall.sourceId);
    }
    if (config?.random) {
        return randomIdGenerator;
    }

    // the default (if nothing is configured specificlly) is to use the random id generator.
    return randomIdGenerator;
}