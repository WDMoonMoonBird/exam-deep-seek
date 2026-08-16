import { InMemoryEventBus } from '../../../src/infrastructure/events/in-memory-event-bus.js';

describe('InMemoryEventBus（EventBus 契约）', () => {
  it('publish 触发对应类型订阅者', async () => {
    const bus = new InMemoryEventBus();
    const events = [];
    bus.subscribe('submission.graded', async (e) => { events.push(e); });
    await bus.publish({ type: 'submission.graded', occurredAt: Date.now(), payload: { id: 1 } });
    expect(events).toHaveLength(1);
    expect(events[0].payload.id).toBe(1);
  });

  it('其他类型的订阅者不被触发', async () => {
    const bus = new InMemoryEventBus();
    let called = 0;
    bus.subscribe('project.graded', async () => { called++; });
    await bus.publish({ type: 'submission.graded', payload: {} });
    expect(called).toBe(0);
  });

  it('退订后不再触发', async () => {
    const bus = new InMemoryEventBus();
    let called = 0;
    const unsub = bus.subscribe('x', async () => { called++; });
    await bus.publish({ type: 'x' });
    unsub();
    await bus.publish({ type: 'x' });
    expect(called).toBe(1);
  });

  it('订阅者抛错不影响其他订阅者', async () => {
    const bus = new InMemoryEventBus();
    let called = 0;
    bus.subscribe('x', async () => { throw new Error('boom'); });
    bus.subscribe('x', async () => { called++; });
    await bus.publish({ type: 'x' });
    expect(called).toBe(1);
  });
  it('无订阅者时 publish 不抛错', async () => {
    const bus = new InMemoryEventBus();
    await expect(bus.publish({ type: 'nobody' })).resolves.toBeUndefined();
  });
});