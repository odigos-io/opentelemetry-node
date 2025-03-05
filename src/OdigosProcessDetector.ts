import { Resource, processDetectorSync } from "@opentelemetry/resources";

const PROCESS_PID_KEY = "process.pid";

export class OdigosProcessDetector {
  detect() {
    // Run the default process detector
    const resource = processDetectorSync.detect();

    // Clone attributes and remove "process.id"
    const filteredAttributes = { ...resource.attributes };
    delete filteredAttributes[PROCESS_PID_KEY];
    
    return new Resource(filteredAttributes);
  }
}
