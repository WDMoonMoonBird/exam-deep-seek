/**
 * in-memory-event-bus-extra.test.js — InMemoryEventBus 边界补充。
 * 现有 in-memory-event-bus.test.js 覆盖基础订阅/退订/异常隔离；本文件补：
 * 多订阅者、异步完成等待、退订幂等、无 type 事件、事件对象引用传递。
 */
import { InMemoryEventBus } from '../../../src/infrastructure/events/in-memory-event-bus.js';

describe('InMemoryEventBus — 补充边界', () => {
  it('同一类型多订阅者全部触发', async () => {
    const bus = new InMemoryEventBus();
    let a = 0, b = 0;
    bus.subscribe('x', async () => { a++; });
    bus.subscribe('x', async () => { b++; });
    await bus.publish({ type: 'x', payload: {} });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('publish 等待全部异步 handler 完成（await 语义）', async () => {
    const bus = new InMemoryEventBus();
    let done = false;
    bus.subscribe('slow', async () => { await new Promise((r) => setTimeout(r, 30)); done = true; });
    await bus.publish({ type: 'slow', payload: {} });
    expect(done).toBe(true);
  });

  it('退订函数幂等：重复调用不抛错且保持退订', async () => {
    const bus = new InMemoryEventBus();
    let called = 0;
    const unsub = bus.subscribe('x', async () => { called++; });
    unsub();
    unsub(); // 二次调用应无副作用
    await bus.publish({ type: 'x', payload: {} });
    expect(called).toBe(0);
  });

  it('handler 收到原始事件对象（引用相等）', async () => {
    const bus = new InMemoryEventBus();
    let got = null;
    bus.subscribe('x', async (e) => { got = e; });
    const ev = { type: 'x', occurredAt: 1, payload: { id: 7 } };
    await bus.publish(ev);
    expect(got).toBe(ev);
  });

  it('publish 无 type 事件 → 不抛错', async () => {
    const bus = new InMemoryEventBus();
    await expect(bus.publish({ payload: {} })).resolves.toBeUndefined();
  });

  it('publish(undefined) → 不抛错', async () => {
    const bus = new InMemoryEventBus();
    await expect(bus.publish(undefined)).resolves.toBeUndefined();
  });

  it('publish(null) → 不抛错', async () => {
    const bus = new InMemoryEventBus();
    await expect(bus.publish(null)).resolves.toBeUndefined();
  });
});
