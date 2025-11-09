import { IdGenerator } from "@opentelemetry/sdk-trace-base";
import { randomIdGenerator } from "./random";

const TRACE_ID_BYTES = 16;

export class TimedWallIdGenerator implements IdGenerator {
  private readonly sourceId: number;
  private traceIdBuffer: Buffer;

  constructor(sourceId: number) {
    // sourceId should be between 0-255 (8 bits)
    this.sourceId = sourceId & 0xff;
    this.traceIdBuffer = Buffer.allocUnsafe(TRACE_ID_BYTES);
  }

  generateTraceId(): string {
    const msSinceEpoch = BigInt(Date.now());
    const msToNs = BigInt(1000000);
    const nanoSeconds = msSinceEpoch * msToNs;
    // turn the nanoSeconds unit64 number into a buffer with 8 bytes
    // so the buffer content will be the nanoSeconds number in big endian order
    this.traceIdBuffer.writeBigUInt64BE(nanoSeconds, 0);

    // byte number 7 is random byte
    this.traceIdBuffer.writeUInt8(Math.floor(Math.random() * 256), 7);

    // byte 8 is a source id value from configuration (required)
    this.traceIdBuffer.writeUInt8(this.sourceId, 8);

    // unsigned right shift drops decimal part of the number
    // it is required because if a number between 2**32 and 2**32 - 1 is generated, an out of range error is thrown by writeUInt32BE
    this.traceIdBuffer.writeUInt32BE((Math.random() * 2 ** 32) >>> 0, 8);
    this.traceIdBuffer.writeUInt32BE((Math.random() * 2 ** 32) >>> 0, 12);

    this.traceIdBuffer[8] = this.sourceId;
    return this.traceIdBuffer.toString('hex');
  }

  generateSpanId(): string {
    return randomIdGenerator.generateSpanId();
  }
}