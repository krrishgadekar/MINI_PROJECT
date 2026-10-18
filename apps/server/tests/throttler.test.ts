import { SocketThrottler } from '../src/realtime/throttler';

describe('AIMD Socket Throttler', () => {
  let mockSocket: { id: string; emit: jest.Mock };
  let emittedEvents: Array<{ event: string; args: any[] }>;

  beforeEach(() => {
    jest.useFakeTimers();
    emittedEvents = [];
    mockSocket = {
      id: 'test-socket-123',
      emit: jest.fn((event, ...args) => {
        emittedEvents.push({ event, args });
      }),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('initializes with default window size of 10 and flushes on queue threshold', () => {
    const throttler = new SocketThrottler(mockSocket);
    expect(throttler.getWindowSize()).toBe(10);

    // Enqueue 9 events -> should not flush yet
    for (let i = 0; i < 9; i++) {
      throttler.enqueue('debt:created', { id: `debt-${i}` });
    }
    expect(mockSocket.emit).not.toHaveBeenCalled();

    // 10th event reaches windowSize=10 -> triggers flush
    throttler.enqueue('debt:created', { id: 'debt-9' });
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    expect(emittedEvents[0].event).toBe('batch:update');
    expect(emittedEvents[0].args[0].batchId).toBe(1);
    expect(emittedEvents[0].args[0].events.length).toBe(10);

    throttler.destroy();
  });

  test('healthy client increases window size on acks up to cap of 50', () => {
    const throttler = new SocketThrottler(mockSocket);

    // Initial window = 10
    expect(throttler.getWindowSize()).toBe(10);

    // Simulate 50 successful cycles with ack
    for (let cycle = 1; cycle <= 45; cycle++) {
      throttler.enqueue('ping', { cycle });
      throttler.flush();
      const lastCall = emittedEvents[emittedEvents.length - 1];
      const batchId = lastCall?.args[0]?.batchId;
      if (batchId) {
        throttler.handleAck(batchId);
      }
    }

    // Should climb and cap strictly at 50 (Additive Increase)
    expect(throttler.getWindowSize()).toBe(50);

    // Additional acks should never exceed 50
    throttler.enqueue('extra', {});
    throttler.flush();
    const batchId = emittedEvents[emittedEvents.length - 1]?.args[0]?.batchId;
    throttler.handleAck(batchId);
    expect(throttler.getWindowSize()).toBe(50);

    throttler.destroy();
  });

  test('slow client shrinks window by halving on 500ms ack timeout down to floor 1', () => {
    const throttler = new SocketThrottler(mockSocket);
    expect(throttler.getWindowSize()).toBe(10);

    // Trigger flush
    throttler.enqueue('event1', {});
    throttler.flush();

    // Fast forward 500ms without ack (timeout)
    jest.advanceTimersByTime(500);

    // Window should halve: 10 -> 5
    expect(throttler.getWindowSize()).toBe(5);

    // Next unacked batch
    throttler.enqueue('event2', {});
    throttler.flush();
    jest.advanceTimersByTime(500);

    // Window should halve: 5 -> 2
    expect(throttler.getWindowSize()).toBe(2);

    // Next unacked batch
    throttler.enqueue('event3', {});
    throttler.flush();
    jest.advanceTimersByTime(500);

    // Window should halve: 2 -> 1 (floor)
    expect(throttler.getWindowSize()).toBe(1);

    // Further timeouts stay at floor 1
    throttler.enqueue('event4', {});
    throttler.flush();
    jest.advanceTimersByTime(500);
    expect(throttler.getWindowSize()).toBe(1);

    throttler.destroy();
  });

  test('periodic flush flushes queue every 200ms tick even if below window size', () => {
    const throttler = new SocketThrottler(mockSocket);

    // Enqueue only 2 events (below window size 10)
    throttler.enqueue('audit:log', { action: 'view' });
    throttler.enqueue('audit:log', { action: 'click' });
    expect(mockSocket.emit).not.toHaveBeenCalled();

    // Advance 200ms tick
    jest.advanceTimersByTime(200);

    expect(mockSocket.emit).toHaveBeenCalledWith('batch:update', {
      batchId: 1,
      events: [
        { event: 'audit:log', payload: { action: 'view' } },
        { event: 'audit:log', payload: { action: 'click' } },
      ],
    });

    throttler.destroy();
  });
});
