/**
 * compose 组合根装配冒烟测试（integration/compose.test.js）
 *
 * 覆盖：server/src/infrastructure/bootstrap/compose.js
 *   compose({ prisma, logger }) → app.locals 结构完整，8 个装配项齐全且方法可调用。
 *
 * 说明：本测试不依赖真实 DB（prisma 传替身），但随集成套件在测试库环境下执行；
 *       不调用任何会触发真实 DeepSeek API 的方法（仅断言方法存在）。
 *
 * 契约依据：app.js 中 `Object.assign(app.locals, compose({ prisma, logger }))`
 *           controller 经 req.app.locals.<useCase> 取用。
 */

import { compose } from '../../src/infrastructure/bootstrap/compose.js';

describe('compose 组合根装配冒烟', () => {
  let locals;

  const fakePrisma = {}; // compose 装配阶段不访问 DB
  const logger = { warn() {}, info() {}, error() {} };

  beforeAll(() => {
    locals = compose({ prisma: fakePrisma, logger });
  });

  it('C1: 返回 app.locals 结构完整（8 个装配项）', () => {
    expect(locals).toBeTruthy();
    for (const key of [
      'reviewUseCases',
      'questionUseCases',
      'submissionUseCases',
      'aiGateway',
      'configRepo',
      'eventBus',
      'socketNotifier',
      'rateLimiter',
    ]) {
      expect(locals).toHaveProperty(key);
    }
  });

  it('C2: use-cases 方法可调用（函数存在）', () => {
    expect(typeof locals.reviewUseCases.regrade).toBe('function');
    expect(typeof locals.reviewUseCases.manualAdjust).toBe('function');
    expect(typeof locals.reviewUseCases.review).toBe('function');
    expect(typeof locals.questionUseCases.create).toBe('function');
    expect(typeof locals.submissionUseCases.submit).toBe('function');
    expect(typeof locals.submissionUseCases.saveDraft).toBe('function');
    expect(typeof locals.submissionUseCases.retry).toBe('function');
  });

  it('C3: 适配器方法可调用（不触发真实 API/DB）', () => {
    // AiGateway
    expect(typeof locals.aiGateway.grade).toBe('function');
    expect(typeof locals.aiGateway.parsePaper).toBe('function');
    expect(typeof locals.aiGateway.gradeProject).toBe('function');
    // SystemConfigRepository
    expect(typeof locals.configRepo.get).toBe('function');
    expect(typeof locals.configRepo.set).toBe('function');
    expect(typeof locals.configRepo.getApiKey).toBe('function');
    expect(typeof locals.configRepo.getBaseUrl).toBe('function');
    expect(typeof locals.configRepo.getModel).toBe('function');
    // InMemoryEventBus
    expect(typeof locals.eventBus.publish).toBe('function');
    expect(typeof locals.eventBus.subscribe).toBe('function');
    // SocketNotifier
    expect(typeof locals.socketNotifier.notifyGraded).toBe('function');
    expect(typeof locals.socketNotifier.notifyProjectGraded).toBe('function');
    // InMemoryRateLimiter
    expect(typeof locals.rateLimiter.isBlocked).toBe('function');
    expect(typeof locals.rateLimiter.recordFailure).toBe('function');
    expect(typeof locals.rateLimiter.recordSuccess).toBe('function');
  });

  it('C4: use-cases 已通过依赖注入连接仓储与网关', () => {
    // 各 use-case 持有装配好的仓储实例（同一 prisma 客户端）
    expect(locals.reviewUseCases.submissionRepo).toBeTruthy();
    expect(locals.questionUseCases.questionRepo).toBeTruthy();
    expect(locals.submissionUseCases.submissionRepo).toBeTruthy();
    // ReviewUseCases 持有 compose 装配的 aiGateway（同一实例）
    expect(locals.reviewUseCases.aiGateway).toBe(locals.aiGateway);
    // DeepSeekGateway 持有 SystemConfigRepository（同一实例）
    expect(locals.aiGateway.configRepo).toBe(locals.configRepo);
  });

  it('C5: rateLimiter 可实际工作（登录限流端口冒烟，不依赖 DB）', async () => {
    const key = 'compose-smoke-' + Date.now();
    expect(await locals.rateLimiter.isBlocked(key)).toBe(false);
    for (let i = 0; i < 10; i++) await locals.rateLimiter.recordFailure(key);
    expect(await locals.rateLimiter.isBlocked(key)).toBe(true);
    await locals.rateLimiter.recordSuccess(key);
    expect(await locals.rateLimiter.isBlocked(key)).toBe(false);
  });
});
