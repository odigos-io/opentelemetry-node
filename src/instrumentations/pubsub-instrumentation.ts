// @ts-nocheck
import { context, propagation, Span, SpanKind, trace } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
  type ShimWrapped,
} from "@opentelemetry/instrumentation";
import { VERSION } from "../version";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";

type AttributesMap = Record<string, string> | undefined;

const INJECT_KEYS = ["traceparent", "tracestate"] as const;

function ensureAttributes(obj?: Record<string, string>): Record<string, string> {
  if (obj && typeof obj === "object") return { ...obj };
  return {};
}

function injectIfMissing(carrier: Record<string, string>, activeCtx: any) {
  // respect existing headers
  if (INJECT_KEYS.some((k) => carrier[k])) return carrier;
  try {
    propagation.inject(activeCtx, carrier);
  } catch (e) {
    // fail-open
  }
  return carrier;
}

// local symbol to mark per-message span and end-once state
const kConsumerSpan: unique symbol = Symbol("odigos.pubsub.consumerSpan");
const kEnded: unique symbol = Symbol("odigos.pubsub.consumerSpan.ended");

export class PubSubInstrumentation extends InstrumentationBase<any> {
  constructor() {
    super("@odigos/instrumentation-gcp-pubsub", VERSION);
  }

  protected init(): InstrumentationNodeModuleDefinition<any>[] {
    const self = this;
    return [
      new InstrumentationNodeModuleDefinition<any>(
        "@google-cloud/pubsub",
        ["*"],
        (moduleExports: any) => {
          if (!moduleExports) return moduleExports;
          // Patching producer APIs
          try {
            const TopicProto = (moduleExports as any).Topic?.prototype;
            if (TopicProto) {
              (self as any)._wrap(TopicProto, "publishMessage", self._createPublishMessageWrap());
              (self as any)._wrap(TopicProto, "publish", self._createPublishLegacyWrap());
            }
            const PublisherProto = (moduleExports as any).Publisher?.prototype;
            if (PublisherProto) {
              (self as any)._wrap(PublisherProto, "publish", self._createPublisherPublishWrap());
            }
          } catch (e) {
            // fail-open
          }

          // Patching consumer APIs
          try {
            const SubscriptionProto = (moduleExports as any).Subscription?.prototype;
            if (SubscriptionProto) {
              (self as any)._wrap(SubscriptionProto, "on", self._createSubscriptionOnWrap());
            }
          } catch (e) {
            // fail-open
          }

          return moduleExports;
        },
        (moduleExports: any) => {
          try {
            const TopicProto = (moduleExports as any).Topic?.prototype;
            if (TopicProto) {
              if (isWrapped(TopicProto.publishMessage)) (self as any)._unwrap(TopicProto, "publishMessage");
              if (isWrapped(TopicProto.publish)) (self as any)._unwrap(TopicProto, "publish");
            }
          } catch {}
          try {
            const SubscriptionProto = (moduleExports as any).Subscription?.prototype;
            if (SubscriptionProto && isWrapped(SubscriptionProto.on)) {
              (self as any)._unwrap(SubscriptionProto, "on");
            }
          } catch {}
        }
      ),
    ];
  }

  private _createPublishMessageWrap() {
    const self = this;
    return function (original: (...args: any[]) => any): any {
      return function wrapped(this: any, message: any, ...rest: any[]) {
        if (!message || typeof message !== "object") {
          return original.apply(this, [message, ...rest]);
        }

        const tracer = (self as any).tracer;
        const topicFullName: string | undefined = safeGetTopicName(this);
        const topicDisplay = normalizeDisplayName(topicFullName);

        // optionally disable spans/propagation via env toggles
        const env = (globalThis as any).process?.env || {};
        const enableSpans = env.OTEL_PUBSUB_SPANS !== "0";
        const enableProp = env.OTEL_PUBSUB_PROPAGATION !== "0";

        let span: Span | undefined;
        const activeCtx = context.active();
        const spanName = topicDisplay ? `PubSub publish ${topicDisplay}` : "PubSub publish";

        if (enableSpans) {
          span = tracer.startSpan(
            spanName,
            {
              kind: SpanKind.PRODUCER,
              attributes: buildCommonMessagingAttrs(topicFullName, "publish"),
            },
            activeCtx
          );
        }

        const ctxForInject = span ? trace.setSpan(activeCtx, span) : activeCtx;

        let msgObj = message;
        try {
          if (enableProp) {
            const attrs = ensureAttributes(message?.attributes as AttributesMap);
            msgObj = { ...message, attributes: injectIfMissing(attrs, ctxForInject) };
          }
        } catch (e) {
          // fail-open
        }

        const exec = () => original.apply(this, [msgObj, ...rest]);
        return safeExecuteInTheMiddle(
          exec,
          (err, result) => {
            if (span) {
              try {
                if (err) span.recordException(err as any);
                span.end();
              } catch {}
            }
          },
          true
        );
      } as any;
    };
  }

  private _createPublishLegacyWrap() {
    const self = this;
    return function (original: (...args: any[]) => any): any {
      return function wrapped(this: any, data: any, attributes?: Record<string, string>, ...rest: any[]) {
        const tracer = (self as any).tracer;
        const topicFullName: string | undefined = safeGetTopicName(this);
        const topicDisplay = normalizeDisplayName(topicFullName);

        const env = (globalThis as any).process?.env || {};
        const enableSpans = env.OTEL_PUBSUB_SPANS !== "0";
        const enableProp = env.OTEL_PUBSUB_PROPAGATION !== "0";

        let span: Span | undefined;
        const activeCtx = context.active();
        const spanName = topicDisplay ? `PubSub publish ${topicDisplay}` : "PubSub publish";
        if (enableSpans) {
          span = tracer.startSpan(
            spanName,
            {
              kind: SpanKind.PRODUCER,
              attributes: buildCommonMessagingAttrs(topicFullName, "publish"),
            },
            activeCtx
          );
        }

        const ctxForInject = span ? trace.setSpan(activeCtx, span) : activeCtx;
        let attrs = attributes;
        try {
          if (enableProp) {
            attrs = injectIfMissing(ensureAttributes(attributes), ctxForInject);
          }
        } catch {}

        const exec = () => original.apply(this, [data, attrs, ...rest]);
        return safeExecuteInTheMiddle(
          exec,
          (err: unknown) => {
            if (span) {
              try {
                if (err) span.recordException(err as any);
                span.end();
              } catch {}
            }
          },
          true
        );
      } as any;
    };
  }

  private _createPublisherPublishWrap() {
    const self = this;
    return function (original: (...args: any[]) => any): any {
      return function wrapped(this: any, data: any, attributes?: Record<string, string>, ...rest: any[]) {
        const tracer = (self as any).tracer;
        const topicFullName: string | undefined = safeGetTopicNameFromPublisher(this);
        const topicDisplay = normalizeDisplayName(topicFullName);

        const env = (globalThis as any).process?.env || {};
        const enableSpans = env.OTEL_PUBSUB_SPANS !== "0";
        const enableProp = env.OTEL_PUBSUB_PROPAGATION !== "0";

        let span: Span | undefined;
        const activeCtx = context.active();
        const spanName = topicDisplay ? `PubSub publish ${topicDisplay}` : "PubSub publish";
        if (enableSpans) {
          span = tracer.startSpan(
            spanName,
            {
              kind: SpanKind.PRODUCER,
              attributes: buildCommonMessagingAttrs(topicFullName, "publish"),
            },
            activeCtx
          );
        }

        const ctxForInject = span ? trace.setSpan(activeCtx, span) : activeCtx;
        let attrs = attributes;
        try {
          if (enableProp) {
            attrs = injectIfMissing(ensureAttributes(attributes), ctxForInject);
          }
        } catch {}

        const exec = () => original.apply(this, [data, attrs, ...rest]);
        return safeExecuteInTheMiddle(
          exec,
          (err: unknown) => {
            if (span) {
              try {
                if (err) span.recordException(err as any);
                span.end();
              } catch {}
            }
          },
          true
        );
      } as any;
    };
  }

  private _createSubscriptionOnWrap() {
    const self = this;
    return function (original: (...args: any[]) => any): ShimWrapped {
      return function wrapped(this: any, event: string, listener: (...args: any[]) => any) {
        if (event !== "message" || typeof listener !== "function") {
          return original.apply(this, [event as any, listener]);
        }

        const subscriptionInstance = this;
        const wrappedListener = function (msg: any, ...rest: any[]) {
          const env = (globalThis as any).process?.env || {};
          const enableSpans = env.OTEL_PUBSUB_SPANS !== "0";
          const enableProp = env.OTEL_PUBSUB_PROPAGATION !== "0";

          const getter = {
            keys: (c: Record<string, string>) => Object.keys(c || {}),
            get: (c: Record<string, string>, k: string) => (c ? c[k] : undefined),
          } as const;

          const baseCtx = context.active();
          const extracted = enableProp
            ? propagation.extract(baseCtx, (msg?.attributes as Record<string, string>) || {}, getter)
            : baseCtx;

          const subscriptionFullName: string | undefined = safeGetSubscriptionName(subscriptionInstance);
          const subscriptionDisplay = normalizeDisplayName(subscriptionFullName);
          const spanName = subscriptionDisplay ? `PubSub process ${subscriptionDisplay}` : "PubSub process";
          const span = enableSpans
            ? (self as any).tracer.startSpan(
                spanName,
                {
                  kind: SpanKind.CONSUMER,
                  attributes: buildCommonMessagingAttrs(subscriptionFullName, "process"),
                },
                extracted
              )
            : undefined;

          // end-once helper specific to this message
          const endSpanOnce = (() => {
            let ended = false;
            return () => {
              if (!span || ended) return;
              ended = true;
              try { span.end(); } catch {}
            };
          })();

          // Patch ack/nack to end span exactly once
          tryPatchAckNack(msg, endSpanOnce);

          const ctxForListener = span ? trace.setSpan(extracted, span) : extracted;
          return context.with(ctxForListener, () => {
            const res = safeExecuteInTheMiddle(
              () => listener(msg, ...rest),
              (err: unknown) => {
                if (err && span) {
                  try { span.recordException(err as any); } catch {}
                }
                // If user did not ack/nack synchronously, make a microtask fallback to avoid stuck spans
                queueMicrotask(endSpanOnce);
              },
              true
            );
            return res;
          });
        };

        return original.apply(this, [event as any, wrappedListener]);
      } as any;
    };
  }
}

function safeGetTopicName(topicInstance: any): string | undefined {
  try {
    return topicInstance?.name || topicInstance?.topicName || topicInstance?.fullName;
  } catch {
    return undefined;
  }
}

function safeGetSubscriptionName(subInstance: any): string | undefined {
  try {
    return subInstance?.name || subInstance?.subscriptionName || subInstance?.fullName;
  } catch {
    return undefined;
  }
}

function safeGetTopicNameFromPublisher(publisherInstance: any): string | undefined {
  try {
    // some versions expose .topic.name via internal reference
    return (
      publisherInstance?.topic?.name ||
      publisherInstance?.topicName ||
      publisherInstance?.name
    );
  } catch {
    return undefined;
  }
}

function tryPatchAckNack(message: any, end: () => void) {
  if (!message || typeof message !== "object") return;
  try {
    // Guard against double wrapping
    if ((message as any)[kEnded]) return;
    Object.defineProperty(message, kEnded, { value: false, enumerable: false, configurable: true });

    for (const methodName of ["ack", "nack"]) {
      const orig = message[methodName];
      if (typeof orig !== "function") continue;
      if (isWrapped(orig as any)) continue;
      const wrapped = function (this: any, ...args: any[]) {
        try { end(); } catch {}
        return orig.apply(this, args);
      };
      try {
        Object.defineProperty(message, methodName, { value: wrapped, configurable: true });
      } catch {}
    }
  } catch {}
}

function normalizeDisplayName(fullName?: string): string | undefined {
  if (!fullName) return undefined;
  try {
    // full resource names look like projects/<project>/topics/<name> or subscriptions/<name>
    const parts = fullName.split('/');
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    if (prev === 'topics' || prev === 'subscriptions') return last;
  } catch {}
  return fullName;
}

function buildCommonMessagingAttrs(destinationName: string | undefined, op: "publish" | "process") {
  const attrs: Record<string, unknown> = {
    [SemanticAttributes.MESSAGING_SYSTEM]: "gcp_pubsub",
    [SemanticAttributes.MESSAGING_OPERATION]: op,
  };
  if (destinationName) {
    attrs[SemanticAttributes.MESSAGING_DESTINATION] = destinationName;
  }
  return attrs;
}


