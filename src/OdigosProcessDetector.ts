import { processDetector, resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_PROCESS_PID } from "@opentelemetry/semantic-conventions/incubating";

export const PROCESS_VPID = "process.vpid";

export class OdigosProcessDetector {
  detect() {
    // Run the default process detector
    const resource = processDetector.detect();

    // Clone attributes and remove "process.id"
    const filteredAttributes = { ...resource.attributes };
    delete filteredAttributes[ATTR_PROCESS_PID];

    // Add "process.vpid" attribute
    filteredAttributes[PROCESS_VPID] = process.pid;

    return resourceFromAttributes(filteredAttributes);
  }
}
