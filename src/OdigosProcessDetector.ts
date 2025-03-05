import { Resource, processDetectorSync } from "@opentelemetry/resources";
import { SEMRESATTRS_PROCESS_PID } from "@opentelemetry/semantic-conventions";

export class OdigosProcessDetector {
  detect() {
    // Run the default process detector
    const resource = processDetectorSync.detect();

    // Clone attributes and remove "process.id"
    const filteredAttributes = { ...resource.attributes };
    delete filteredAttributes[SEMRESATTRS_PROCESS_PID];
    
    return new Resource(filteredAttributes);
  }
}
