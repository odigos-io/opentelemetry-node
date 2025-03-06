import { Resource, processDetectorSync } from "@opentelemetry/resources";
import { SEMRESATTRS_PROCESS_PID } from "@opentelemetry/semantic-conventions";


const PROCESS_VPID = "process.vpid";
export class OdigosProcessDetector {
  detect() {
    // Run the default process detector
    const resource = processDetectorSync.detect();

    // Clone attributes and remove "process.id"
    const filteredAttributes = { ...resource.attributes };
    delete filteredAttributes[SEMRESATTRS_PROCESS_PID];

    // Add "process.vpid" attribute
    filteredAttributes[PROCESS_VPID] = process.pid;

    return new Resource(filteredAttributes);
  }
}
