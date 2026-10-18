/**
 * throttler.ts — AIMD (Additive Increase / Multiplicative Decrease) Realtime Event Throttler
 *
 * Rules:
 *   - Initial window size: 10
 *   - Window increase: +1 on ack (Additive Increase)
 *   - Window decrease: Halve on 500ms ack timeout (Multiplicative Decrease)
 *   - Window bounds: Min 1 (floor), Max 50 (cap)
 *   - Flush conditions: When queue reaches window size OR on periodic 200ms tick
 *   - Event delivered: 'batch:update' with payload { batchId: number, events: Array<{ event: string, payload: any }> }
 *   - Acknowledgement: 'presence:ack' with { batchId: number }
 */

export interface QueuedEvent {
  event: string;
  payload: any;
}

export interface ThrottlerClock {
  setTimeout: (fn: () => void, ms: number) => any;
  clearTimeout: (timerId: any) => void;
  now: () => number;
}

export interface SocketLike {
  id: string;
  emit: (event: string, ...args: any[]) => any;
}

export class SocketThrottler {
  private windowSize: number = 10;
  private minWindow: number = 1;
  private maxWindow: number = 50;
  private ackTimeoutMs: number = 500;
  private flushIntervalMs: number = 200;

  private pendingQueue: QueuedEvent[] = [];
  private batchCounter: number = 0;
  private unackedBatches: Map<number, { timerId: any; count: number; sentAt: number }> = new Map();
  private flushTimer: any = null;

  public clock: ThrottlerClock;
  private socket: SocketLike;

  constructor(socket: SocketLike, clock?: Partial<ThrottlerClock>) {
    this.socket = socket;
    this.clock = {
      setTimeout: clock?.setTimeout || ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: clock?.clearTimeout || ((id) => clearTimeout(id)),
      now: clock?.now || (() => Date.now()),
    };

    this.startFlushTimer();
  }

  public getWindowSize(): number {
    return this.windowSize;
  }

  public getQueueLength(): number {
    return this.pendingQueue.length;
  }

  public getUnackedCount(): number {
    return this.unackedBatches.size;
  }

  public enqueue(event: string, payload: any): void {
    this.pendingQueue.push({ event, payload });
    if (this.pendingQueue.length >= this.windowSize) {
      this.flush();
    }
  }

  public flush(): void {
    if (this.pendingQueue.length === 0) return;

    const countToFlush = Math.min(this.windowSize, this.pendingQueue.length);
    const eventsToEmit = this.pendingQueue.splice(0, countToFlush);
    const batchId = ++this.batchCounter;

    const timerId = this.clock.setTimeout(() => {
      this.handleTimeout(batchId);
    }, this.ackTimeoutMs);

    this.unackedBatches.set(batchId, {
      timerId,
      count: eventsToEmit.length,
      sentAt: this.clock.now(),
    });

    try {
      this.socket.emit('batch:update', {
        batchId,
        events: eventsToEmit,
      });
    } catch {
      // Socket emission error, ignore
    }
  }

  public handleAck(batchId: number): void {
    const batch = this.unackedBatches.get(batchId);
    if (!batch) return;

    this.clock.clearTimeout(batch.timerId);
    this.unackedBatches.delete(batchId);

    // Additive Increase: +1 on ack up to cap 50
    this.windowSize = Math.min(this.maxWindow, this.windowSize + 1);

    if (this.pendingQueue.length > 0) {
      this.flush();
    }
  }

  private handleTimeout(batchId: number): void {
    if (!this.unackedBatches.has(batchId)) return;

    this.unackedBatches.delete(batchId);

    // Multiplicative Decrease: halve on timeout down to floor 1
    this.windowSize = Math.max(this.minWindow, Math.floor(this.windowSize / 2));

    // Try flushing any remaining items under shrunk window
    if (this.pendingQueue.length > 0) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = this.clock.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
      this.startFlushTimer();
    }, this.flushIntervalMs);
  }

  public destroy(): void {
    if (this.flushTimer) {
      this.clock.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const [, batch] of this.unackedBatches) {
      this.clock.clearTimeout(batch.timerId);
    }
    this.unackedBatches.clear();
    this.pendingQueue = [];
  }
}

/** Registry of active throttlers per socket */
const throttlers = new Map<string, SocketThrottler>();

export const getOrCreateThrottler = (
  socket: SocketLike,
  clock?: Partial<ThrottlerClock>,
): SocketThrottler => {
  let throttler = throttlers.get(socket.id);
  if (!throttler) {
    throttler = new SocketThrottler(socket, clock);
    throttlers.set(socket.id, throttler);
  }
  return throttler;
};

export const removeThrottler = (socketId: string): void => {
  const throttler = throttlers.get(socketId);
  if (throttler) {
    throttler.destroy();
    throttlers.delete(socketId);
  }
};
