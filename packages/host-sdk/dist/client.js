import { parseWorkflowEvent, } from "@living-software/contracts";
import { assertPrivacySafeMetadata } from "./privacy.js";
import { EVENT_BATCH_SCHEMA_VERSION, } from "./types.js";
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_QUEUE_SIZE = 500;
export class EventQueueFullError extends Error {
    constructor(maxQueueSize) {
        super(`Living event queue reached its limit of ${maxQueueSize}`);
        this.name = "EventQueueFullError";
    }
}
export class EventClientClosedError extends Error {
    constructor() {
        super("Living event client is closed");
        this.name = "EventClientClosedError";
    }
}
function positiveInteger(value, fallback, name) {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < 1) {
        throw new TypeError(`${name} must be a positive integer`);
    }
    return resolved;
}
export function createEventClient(options) {
    const maxBatchSize = positiveInteger(options.maxBatchSize, DEFAULT_BATCH_SIZE, "maxBatchSize");
    const maxQueueSize = positiveInteger(options.maxQueueSize, DEFAULT_QUEUE_SIZE, "maxQueueSize");
    if (maxBatchSize > maxQueueSize) {
        throw new TypeError("maxBatchSize cannot exceed maxQueueSize");
    }
    const queue = [];
    let batchSequence = 0;
    let isClosed = false;
    let isClosing = false;
    let activeFlush;
    const performFlush = async () => {
        let batches = 0;
        let events = 0;
        while (queue.length > 0) {
            const pending = queue.splice(0, maxBatchSize);
            const batch = Object.freeze({
                schemaVersion: EVENT_BATCH_SCHEMA_VERSION,
                sequence: batchSequence,
                events: Object.freeze([...pending]),
            });
            try {
                const receipt = await options.transport.send(batch);
                if (receipt !== undefined && receipt.accepted !== pending.length) {
                    throw new Error(`Transport accepted ${receipt.accepted} of ${pending.length} events; partial acceptance is unsupported`);
                }
            }
            catch (error) {
                queue.unshift(...pending);
                throw error;
            }
            batchSequence += 1;
            batches += 1;
            events += pending.length;
        }
        return { batches, events };
    };
    const flush = async () => {
        if (activeFlush !== undefined)
            return activeFlush;
        activeFlush = performFlush().finally(() => {
            activeFlush = undefined;
        });
        return activeFlush;
    };
    return {
        async record(candidate) {
            if (isClosed || isClosing)
                throw new EventClientClosedError();
            if (queue.length >= maxQueueSize)
                throw new EventQueueFullError(maxQueueSize);
            const event = parseWorkflowEvent(candidate);
            assertPrivacySafeMetadata(event.metadata, options.metadata);
            queue.push(event);
            const shouldFlush = queue.length >= maxBatchSize;
            if (shouldFlush)
                await flush();
            return {
                event,
                queued: queue.length,
                flushed: shouldFlush,
            };
        },
        flush,
        async close() {
            if (isClosed)
                return { batches: 0, events: 0 };
            isClosing = true;
            try {
                const result = await flush();
                isClosed = true;
                return result;
            }
            finally {
                isClosing = false;
            }
        },
        get queued() {
            return queue.length;
        },
        get closed() {
            return isClosed;
        },
    };
}
//# sourceMappingURL=client.js.map