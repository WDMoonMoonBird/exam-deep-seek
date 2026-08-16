/**
 * InMemoryEventBus —— 进程内事件总线（实现 domain/events.js 的 EventBus 契约）。
 * 订阅者错误互不影响（Promise.allSettled）；支持退订。
 */

export class InMemoryEventBus {
  constructor() {
    this.handlers = new Map();
  }

  async publish(event) {
    const hs = this.handlers.get(event?.type) || [];
    await Promise.allSettled(hs.map((h) => h(event)));
  }

  subscribe(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(handler);
    return () => {
      const arr = this.handlers.get(type) || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }
}