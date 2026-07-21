import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  LIVE_EVENT_SCHEMA_VERSION,
  LIVE_REPLAY_SCHEMA_VERSION,
  parseLiveEvent,
  parseLiveReplay,
  type LiveEvent,
  type LiveReplay,
} from "@living-software/contracts";
import { canonicalJson, sha256 } from "@living-software/cli";

const EVENT_FILE = /^(\d{10})-([a-f0-9]{64})\.json$/u;
const MAX_EVENT_BYTES = 64 * 1024;
const MAX_EVENT_COUNT = 10_000;
const REPLAY_PAGE_SIZE = 500;

export class LiveEventStoreError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LiveEventStoreError";
  }
}

export type LiveEventDraft = Omit<
  LiveEvent,
  "schemaVersion" | "sessionId" | "sequence" | "previousEventHash" | "eventHash"
>;

export interface LiveSubscription {
  readonly replays: readonly LiveReplay[];
  close(): void;
}

function withoutEventHash(event: LiveEvent): Omit<LiveEvent, "eventHash"> {
  const { eventHash: _eventHash, ...payload } = event;
  return payload;
}

function semanticDraft(event: LiveEvent): unknown {
  const {
    schemaVersion: _schemaVersion,
    sessionId: _sessionId,
    sequence: _sequence,
    emittedAt: _emittedAt,
    previousEventHash: _previousEventHash,
    eventHash: _eventHash,
    ...draft
  } = event;
  return draft;
}

function sameFile(
  left: Readonly<{ dev: number; ino: number }>,
  right: Readonly<{ dev: number; ino: number }>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readStableEventFile(target: string, index: number): Promise<string> {
  const before = await lstat(target);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_EVENT_BYTES) {
    throw new LiveEventStoreError("UNSAFE_EVENT_FILE", "Persisted live event is not a bounded regular file");
  }
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes: Buffer;
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      !sameFile(opened, before) ||
      opened.size !== before.size ||
      opened.size > MAX_EVENT_BYTES
    ) {
      throw new LiveEventStoreError(
        "EVENT_FILE_RACED",
        `Persisted live event ${index} changed between validation and open`,
      );
    }
    const openedPath = await lstat(target);
    if (
      openedPath.isSymbolicLink() ||
      !openedPath.isFile() ||
      !sameFile(openedPath, opened) ||
      openedPath.size !== opened.size
    ) {
      throw new LiveEventStoreError(
        "EVENT_FILE_RACED",
        `Persisted live event ${index} path changed before it was read`,
      );
    }
    bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) {
        throw new LiveEventStoreError(
          "EVENT_FILE_RACED",
          `Persisted live event ${index} became shorter while it was read`,
        );
      }
      offset += result.bytesRead;
    }
    const probe = Buffer.allocUnsafe(1);
    if ((await handle.read(probe, 0, 1, bytes.length)).bytesRead !== 0) {
      throw new LiveEventStoreError(
        "EVENT_FILE_RACED",
        `Persisted live event ${index} grew while it was read`,
      );
    }
    const after = await handle.stat();
    const pathAfter = await lstat(target);
    if (
      pathAfter.isSymbolicLink() ||
      !pathAfter.isFile() ||
      !sameFile(pathAfter, opened) ||
      !sameFile(after, opened) ||
      after.size !== opened.size ||
      pathAfter.size !== opened.size ||
      bytes.length !== opened.size
    ) {
      throw new LiveEventStoreError(
        "EVENT_FILE_RACED",
        `Persisted live event ${index} changed while it was read`,
      );
    }
  } finally {
    await handle.close();
  }
  const source = bytes.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(bytes)) {
    throw new LiveEventStoreError("INVALID_EVENT_JSON", `Persisted live event ${index} is not valid UTF-8 JSON`);
  }
  return source;
}

function eventFromDraft(
  draft: LiveEventDraft,
  sessionId: string,
  sequence: number,
  previousEventHash: LiveEvent["previousEventHash"],
): LiveEvent {
  const payload = {
    ...draft,
    schemaVersion: LIVE_EVENT_SCHEMA_VERSION,
    sessionId,
    sequence,
    previousEventHash,
  } as Omit<LiveEvent, "eventHash">;
  return parseLiveEvent({
    ...payload,
    eventHash: computeLiveEventHash(payload),
  });
}

export function computeLiveEventHash(
  event: Omit<LiveEvent, "eventHash">,
): `sha256:${string}` {
  return sha256(event);
}

function parseCursor(value: number | null): number | null {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new LiveEventStoreError("INVALID_CURSOR", "Replay cursor must be a non-negative safe integer");
  }
  return value;
}

export function parseLastEventId(value: string | null): number | null {
  if (value === null || value === "") return null;
  if (!/^(0|[1-9][0-9]{0,15})$/u.test(value)) {
    throw new LiveEventStoreError("INVALID_LAST_EVENT_ID", "Last-Event-ID must be a canonical decimal sequence");
  }
  return parseCursor(Number(value));
}

export class DurableLiveEventStore {
  readonly #directory: string;
  readonly #sessionId: string;
  readonly #listeners = new Set<(event: LiveEvent) => void>();
  readonly #events: LiveEvent[] = [];
  readonly #byEventId = new Map<string, LiveEvent>();
  #directoryIdentity: Readonly<{ dev: number; ino: number }> | undefined;
  #ready: Promise<void> | undefined;
  #serial: Promise<unknown> = Promise.resolve();

  public constructor(options: { directory: string; sessionId: string }) {
    this.#directory = path.resolve(options.directory);
    this.#sessionId = options.sessionId;
  }

  public get sessionId(): string {
    return this.#sessionId;
  }

  async #initialize(): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const directoryStat = await lstat(this.#directory);
    const canonicalDirectory = await realpath(this.#directory);
    if (
      !directoryStat.isDirectory() ||
      directoryStat.isSymbolicLink() ||
      path.relative(this.#directory, canonicalDirectory) !== ""
    ) {
      throw new LiveEventStoreError("UNSAFE_EVENT_DIRECTORY", "Live event storage must be a real directory");
    }
    this.#directoryIdentity = { dev: directoryStat.dev, ino: directoryStat.ino };
    const names = await readdir(this.#directory);
    if (names.length > MAX_EVENT_COUNT) {
      throw new LiveEventStoreError("EVENT_LIMIT_EXCEEDED", "Live event history exceeds its bounded limit");
    }
    const eventNames = names.filter((name) => EVENT_FILE.test(name)).sort();
    if (eventNames.length !== names.length) {
      throw new LiveEventStoreError("UNEXPECTED_EVENT_FILE", "Live event storage contains an unexpected file");
    }
    let previousHash: string | null = null;
    for (const [index, name] of eventNames.entries()) {
      const match = EVENT_FILE.exec(name);
      if (match === null || Number(match[1]) !== index) {
        throw new LiveEventStoreError("EVENT_SEQUENCE_GAP", "Persisted live event filenames are not contiguous");
      }
      const target = path.join(this.#directory, name);
      const source = await readStableEventFile(target, index);
      let candidate: unknown;
      try {
        candidate = JSON.parse(source) as unknown;
      } catch {
        throw new LiveEventStoreError("INVALID_EVENT_JSON", `Persisted live event ${index} is not valid JSON`);
      }
      let event: LiveEvent;
      try {
        event = parseLiveEvent(candidate);
      } catch (error) {
        throw new LiveEventStoreError(
          "INVALID_EVENT_SCHEMA",
          `Persisted live event ${index} failed schema validation`,
          { cause: error },
        );
      }
      if (
        event.sessionId !== this.#sessionId ||
        event.sequence !== index ||
        event.previousEventHash !== previousHash ||
        event.eventHash !== computeLiveEventHash(withoutEventHash(event)) ||
        match[2] !== event.eventHash.slice(7)
      ) {
        throw new LiveEventStoreError("EVENT_CHAIN_INVALID", `Persisted live event ${index} failed chain validation`);
      }
      if (source !== `${canonicalJson(event)}\n`) {
        throw new LiveEventStoreError("NON_CANONICAL_EVENT_FILE", `Persisted live event ${index} is not canonical`);
      }
      if (this.#byEventId.has(event.eventId)) {
        throw new LiveEventStoreError("DUPLICATE_EVENT_ID", "Persisted live event IDs must be unique");
      }
      this.#events.push(event);
      this.#byEventId.set(event.eventId, event);
      previousHash = event.eventHash;
    }
    await this.#assertDirectoryIdentity();
  }

  public ready(): Promise<void> {
    this.#ready ??= this.#initialize();
    return this.#ready;
  }

  async #assertDirectoryIdentity(): Promise<void> {
    const expected = this.#directoryIdentity;
    const current = await lstat(this.#directory);
    const canonicalDirectory = await realpath(this.#directory);
    if (
      expected === undefined ||
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      !sameFile(current, expected) ||
      path.relative(this.#directory, canonicalDirectory) !== ""
    ) {
      throw new LiveEventStoreError(
        "UNSAFE_EVENT_DIRECTORY",
        "Live event storage identity changed after initialization",
      );
    }
  }

  public append(draft: LiveEventDraft): Promise<LiveEvent> {
    const operation = this.#serial.then(async () => {
      await this.ready();
      await this.#assertDirectoryIdentity();
      const duplicate = this.#byEventId.get(draft.eventId);
      if (duplicate !== undefined) {
        const candidate = eventFromDraft(
          draft,
          this.#sessionId,
          duplicate.sequence,
          duplicate.previousEventHash,
        );
        if (canonicalJson(semanticDraft(duplicate)) !== canonicalJson(semanticDraft(candidate))) {
          throw new LiveEventStoreError("EVENT_ID_CONFLICT", `Live event '${draft.eventId}' was reused with different facts`);
        }
        return duplicate;
      }
      if (this.#events.length >= MAX_EVENT_COUNT) {
        throw new LiveEventStoreError("EVENT_LIMIT_EXCEEDED", "Live event history reached its bounded limit");
      }
      const sequence = this.#events.length;
      const previousEventHash = this.#events.at(-1)?.eventHash ?? null;
      const event = eventFromDraft(draft, this.#sessionId, sequence, previousEventHash);
      const serialized = canonicalJson(event);
      const stored = `${serialized}\n`;
      if (Buffer.byteLength(stored, "utf8") > MAX_EVENT_BYTES) {
        throw new LiveEventStoreError("EVENT_TOO_LARGE", "Live event exceeds its bounded storage size");
      }
      const basename = `${String(sequence).padStart(10, "0")}-${event.eventHash.slice(7)}.json`;
      const target = path.join(this.#directory, basename);
      const temporary = `${target}.tmp`;
      try {
        await writeFile(temporary, stored, { encoding: "utf8", flag: "wx" });
        await rename(temporary, target);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
      this.#events.push(event);
      this.#byEventId.set(event.eventId, event);
      for (const listener of this.#listeners) {
        try {
          const result: unknown = listener(event);
          if (result instanceof Promise) void result.catch(() => undefined);
        } catch {
          // Display subscribers cannot make a durable authoritative append fail.
        }
      }
      return event;
    });
    this.#serial = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  #pages(afterSequence: number | null, headIndex = this.#events.length - 1): LiveReplay[] {
    const after = parseCursor(afterSequence);
    if (after !== null && after > headIndex) {
      throw new LiveEventStoreError("CURSOR_AHEAD", "Replay cursor is ahead of the durable event head");
    }
    const start = after === null ? 0 : after + 1;
    const head = this.#events.at(headIndex);
    if (start > headIndex) {
      return [parseLiveReplay({
        schemaVersion: LIVE_REPLAY_SCHEMA_VERSION,
        sessionId: this.#sessionId,
        afterSequence: after,
        headSequence: head?.sequence ?? null,
        headHash: head?.eventHash ?? null,
        events: [],
        hasMore: false,
      })];
    }
    const pages: LiveReplay[] = [];
    let cursor = start;
    while (cursor <= headIndex) {
      const events = this.#events.slice(cursor, Math.min(cursor + REPLAY_PAGE_SIZE, headIndex + 1));
      const pageAfter = cursor === 0 ? null : cursor - 1;
      cursor += events.length;
      pages.push(parseLiveReplay({
        schemaVersion: LIVE_REPLAY_SCHEMA_VERSION,
        sessionId: this.#sessionId,
        afterSequence: pageAfter,
        headSequence: head?.sequence ?? null,
        headHash: head?.eventHash ?? null,
        events,
        hasMore: cursor <= headIndex,
      }));
    }
    return pages;
  }

  public replay(afterSequence: number | null): Promise<readonly LiveReplay[]> {
    return this.#serial.then(async () => {
      await this.ready();
      await this.#assertDirectoryIdentity();
      return this.#pages(afterSequence);
    });
  }

  public subscribe(
    afterSequence: number | null,
    listener: (event: LiveEvent) => void,
  ): Promise<LiveSubscription> {
    const operation = this.#serial.then(async () => {
      await this.ready();
      await this.#assertDirectoryIdentity();
      const replays = this.#pages(afterSequence);
      this.#listeners.add(listener);
      let open = true;
      return {
        replays,
        close: () => {
          if (!open) return;
          open = false;
          this.#listeners.delete(listener);
        },
      };
    });
    this.#serial = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
