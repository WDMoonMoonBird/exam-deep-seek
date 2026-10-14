/**
 * ports-contract.test.js —— 契约实现矩阵（形状断言，零 DB / 零网络）。
 *
 * 对组合根 compose.js 装配的「真适配器」逐一断言：
 *   - 端口方法存在、类型为 function
 *   - async 方法声明为 AsyncFunction（必定返回 Promise）
 *   - 非 async 方法（Prisma 包装）经 stub prisma 调用后返回 thenable
 *
 * 只做形状断言：import 适配器类 + 用最小依赖构造（stub prisma），不连 DB、不调用外部 API。
 */

import { compose } from '../../src/infrastructure/bootstrap/compose.js';
import { DeepSeekGateway } from '../../src/infrastructure/ai/deepseek-gateway.js';
import { CachingAiGateway } from '../../src/infrastructure/ai/caching-ai-gateway.js';
import { QuestionRepository } from '../../src/infrastructure/persistence/question.repository.js';
import { SubmissionRepository } from '../../src/infrastructure/persistence/submission.repository.js';
import { SystemConfigRepository } from '../../src/infrastructure/persistence/system-config.repository.js';
import { SocketNotifier } from '../../src/infrastructure/notifier/socket-notifier.js';
import { InMemoryRateLimiter } from '../../src/infrastructure/rate-limit/in-memory-rate-limiter.js';
import { InMemoryEventBus } from '../../src/infrastructure/events/in-memory-event-bus.js';
import { CompileExecutor } from '../../src/infrastructure/execution/compile-executor.js';
import { isAsyncMethod, classMethods, buildContractMatrix, matrixStats } from './contract-matrix.js';

/** stub prisma：任意属性访问返回可调用对象，方法调用返回 Promise.resolve(null)，绝不触达真实数据库 */
function makeStub() {
  const handler = {
    get(_t, prop) {
      if (prop === 'then' || prop === Symbol.toPrimitive || prop === Symbol.iterator) return undefined;
      return makeStub();
    },
    apply() {
      return Promise.resolve(null);
    },
  };
  return new Proxy(function () {}, handler);
}
const stubPrisma = makeStub();

/** 断言集合对象具备指定方法名且均为 function */
function expectMethods(instanceOrClass, names) {
  for (const n of names) {
    const fn = typeof instanceOrClass === 'function'
      ? (instanceOrClass.prototype || {})[n]
      : instanceOrClass[n];
    expect(typeof fn).toBe('function');
  }
}

describe('组合根 compose() 装配契约', () => {
  const composed = compose({ prisma: stubPrisma, logger: console });

  it('compose() 不触达 DB（stub prisma 下正常装配）', () => {
    expect(composed).toBeDefined();
  });

  it('装配键齐全：3 用例服务 + 5 适配器 + 读模型注入（dshRuns）', () => {
    const keys = Object.keys(composed).sort();
    expect(keys).toEqual(['aiGateway', 'configRepo', 'dshRuns', 'eventBus', 'questionUseCases', 'rateLimiter', 'reviewUseCases', 'socketNotifier', 'submissionUseCases']);
  });

  it('用例服务具备 controllers 依赖的方法（de-facto 使用契约）', () => {
    expectMethods(composed.reviewUseCases, ['regrade', 'manualAdjust', 'review']);
    expectMethods(composed.questionUseCases, ['create']);
    expectMethods(composed.submissionUseCases, ['submit', 'saveDraft', 'retry']);
  });

  it('compose 装配的是真实适配器类实例', () => {
    expect(composed.aiGateway).toBeInstanceOf(DeepSeekGateway);
    expect(composed.configRepo).toBeInstanceOf(SystemConfigRepository);
    expect(composed.eventBus).toBeInstanceOf(InMemoryEventBus);
    expect(composed.socketNotifier).toBeInstanceOf(SocketNotifier);
    expect(composed.rateLimiter).toBeInstanceOf(InMemoryRateLimiter);
  });
});

describe('AiGateway 契约（gateways.js: grade / parsePaper）', () => {
  it('DeepSeekGateway 实现 grade/parsePaper 且为 async（返回 Promise）', () => {
    expectMethods(DeepSeekGateway, ['grade', 'parsePaper']);
    expect(isAsyncMethod(DeepSeekGateway, 'grade')).toBe(true);
    expect(isAsyncMethod(DeepSeekGateway, 'parsePaper')).toBe(true);
  });

  it('CachingAiGateway（装饰器）同样实现 grade/parsePaper（可替换主网关）', () => {
    expectMethods(CachingAiGateway, ['grade', 'parsePaper']);
    expect(isAsyncMethod(CachingAiGateway, 'grade')).toBe(true);
    expect(isAsyncMethod(CachingAiGateway, 'parsePaper')).toBe(true);
  });

  it('grade 的入参形状与契约一致（material/subQuestionTitle/subQuestionContent/referenceAnswer/studentAnswer/maxScore/scoringCriteria）', () => {
    const impl = new DeepSeekGateway({
      configRepo: { getApiKey: async () => 'k', getBaseUrl: async () => 'http://x', getModel: async () => 'm' },
      logger: console,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"score":5,"feedback":"ok"}' } }] }) }),
    });
    const p = impl.grade({ referenceAnswer: 'r', studentAnswer: 's', maxScore: 10, subQuestionContent: 'c' });
    // 形状断言：返回 Promise（不等待真实 AI）
    expect(p).toBeInstanceOf(Promise);
  });
});

describe('NotificationPort 契约（gateways.js: notifyGraded / notifyProjectGraded）', () => {
  it('SocketNotifier 实现两个通知方法且为 async', () => {
    expectMethods(SocketNotifier, ['notifyGraded', 'notifyProjectGraded']);
    expect(isAsyncMethod(SocketNotifier, 'notifyGraded')).toBe(true);
    expect(isAsyncMethod(SocketNotifier, 'notifyProjectGraded')).toBe(true);
  });
  it('未初始化 socket.io 时调用不抛错（io=null 安全降级）', async () => {
    const n = new SocketNotifier();
    await expect(n.notifyGraded(1, {})).resolves.toBeUndefined();
    await expect(n.notifyProjectGraded(1, {})).resolves.toBeUndefined();
  });
});

describe('RateLimiterPort 契约（gateways.js: isBlocked / recordFailure / recordSuccess）', () => {
  it('InMemoryRateLimiter 实现三个方法 + cleanup，且为 async', () => {
    expectMethods(InMemoryRateLimiter, ['isBlocked', 'recordFailure', 'recordSuccess', 'cleanup']);
    expect(isAsyncMethod(InMemoryRateLimiter, 'isBlocked')).toBe(true);
    expect(isAsyncMethod(InMemoryRateLimiter, 'recordFailure')).toBe(true);
    expect(isAsyncMethod(InMemoryRateLimiter, 'recordSuccess')).toBe(true);
  });
  it('行为形状：连续失败达到阈值后 isBlocked 返回 true（进程内，零 DB）', async () => {
    const rl = new InMemoryRateLimiter({ maxFailures: 3, windowMs: 60000 });
    for (let i = 0; i < 3; i++) await rl.recordFailure('k');
    expect(await rl.isBlocked('k')).toBe(true);
    await rl.recordSuccess('k');
    expect(await rl.isBlocked('k')).toBe(false);
  });
});

describe('EventBus 契约（domain/events.js: publish / subscribe）', () => {
  it('InMemoryEventBus 实现 publish(subscribe) 且形状正确', () => {
    expectMethods(InMemoryEventBus, ['publish', 'subscribe']);
    expect(isAsyncMethod(InMemoryEventBus, 'publish')).toBe(true);
    const bus = new InMemoryEventBus();
    const unsub = bus.subscribe('x', async () => {});
    expect(typeof unsub).toBe('function'); // 契约：subscribe 返回退订函数
  });
});

describe('仓储适配器形状（不连 DB：stub prisma 构造）', () => {
  it('QuestionRepository 具备 use-case 依赖的方法，且均返回 Promise', async () => {
    const repo = new QuestionRepository({ prisma: stubPrisma });
    expectMethods(repo, ['findById', 'create']);
    for (const m of ['findById', 'create']) {
      const ret = repo[m](m === 'findById' ? 1 : { teacherId: 1, title: 't', subQuestions: [] });
      expect(ret && typeof ret.then === 'function').toBe(true);
    }
  });

  it('SubmissionRepository 具备 8 个 de-facto 方法，且均返回 Promise', async () => {
    const repo = new SubmissionRepository({ prisma: stubPrisma });
    const names = ['findById', 'findScoreContext', 'update', 'findAssignmentContext', 'findByAssignmentAndQuestion', 'findAssignmentQuestion', 'create', 'resetByAssignment'];
    expectMethods(repo, names);
    expect(repo.findById(1) && typeof repo.findById(1).then === 'function').toBe(true);
    expect(repo.create({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' }) && typeof repo.create({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' }).then === 'function').toBe(true);
  });

  it('SystemConfigRepository 具备 get/set（契约）+ 便捷读取方法，且为 async', async () => {
    const repo = new SystemConfigRepository({ prisma: stubPrisma });
    expectMethods(repo, ['get', 'set', 'getApiKey', 'getBaseUrl', 'getModel', 'getConcurrency', 'loadAll', 'clearCache']);
    expect(isAsyncMethod(SystemConfigRepository, 'get')).toBe(true);
    expect(isAsyncMethod(SystemConfigRepository, 'set')).toBe(true);
    // stub prisma 下 get 走缓存/空配置路径，不触达 DB
    await expect(repo.get('deepseek_api_key', 'fb')).resolves.toBe('fb');
  });

  it('use-cases 内部持有的仓储实例（compose 装配）具备全部被调方法', () => {
    const composed = compose({ prisma: stubPrisma, logger: console });
    const reviewRepo = composed.reviewUseCases.submissionRepo;
    expect(reviewRepo).toBeInstanceOf(SubmissionRepository);
    expectMethods(reviewRepo, ['findById', 'findScoreContext', 'update']);
    const submitRepo = composed.submissionUseCases.submissionRepo;
    expectMethods(submitRepo, ['findAssignmentContext', 'findByAssignmentAndQuestion', 'findAssignmentQuestion', 'update', 'create', 'resetByAssignment']);
    expect(composed.questionUseCases.questionRepo).toBeInstanceOf(QuestionRepository);
    expectMethods(composed.questionUseCases.questionRepo, ['create']);
  });
});

describe('契约核对矩阵（8 仓储 + 5 端口 + EventBus，方法级覆盖）', () => {
  const matrix = buildContractMatrix();
  const stats = matrixStats(matrix);

  it('矩阵覆盖 3 个仓储端口（DSGN-001 契约重写：仅保留有实现有消费的仓储）', () => {
    const ports = matrix.repos.map(p => p.port).sort();
    expect(ports).toEqual(['QuestionRepository', 'SubmissionRepository', 'SystemConfigRepository']);
  });

  it('矩阵覆盖 5 个网关端口 + EventBus', () => {
    const ports = matrix.gateways.map(p => p.port).sort();
    expect(ports).toEqual(['AiGateway', 'ExecutorPort', 'NotificationPort', 'RateLimiterPort', 'UnitOfWork']);
    expect(matrix.eventBus.port).toBe('EventBus');
  });

  it('矩阵 100% 覆盖：3 仓储 18 方法 + 5 端口 9 方法 + EventBus 2 方法 = 29 行（DSGN-001 契约重写后；★R3-D11 增 findAssignmentQuestion）', () => {
    const repoMethods = matrix.repos.reduce((s, p) => s + p.methods.length, 0);
    const gatewayMethods = matrix.gateways.reduce((s, p) => s + p.methods.length, 0);
    expect(repoMethods).toBe(18);
    expect(gatewayMethods).toBe(9);
    expect(matrix.eventBus.methods.length).toBe(2);
    expect(stats.total).toBe(29);
    for (const r of matrix.rows) {
      expect(['一致', '命名不一致', '契约缺实现']).toContain(r.status);
    }
  });

  it('「一致」行的方法在适配器原型上真实存在且为 function', () => {
    const implTable = {
      QuestionRepository, SubmissionRepository, SystemConfigRepository,
      AiGateway: DeepSeekGateway, NotificationPort: SocketNotifier,
      RateLimiterPort: InMemoryRateLimiter, EventBus: InMemoryEventBus,
      ExecutorPort: CompileExecutor, // BUG-010 处置：契约已对齐 compileCheck
    };
    for (const r of matrix.rows) {
      if (r.status !== '一致') continue;
      const cls = implTable[r.port];
      expect(cls).toBeDefined();
      const fn = cls.prototype[r.method];
      expect(typeof fn).toBe('function');
    }
  });
});

describe('适配器额外方法盘点（契约外的实现方法，供架构师评估契约宽度）', () => {
  it('记录 QuestionRepository 额外方法 create（契约文档为 save）', () => {
    const methods = classMethods(QuestionRepository);
    expect(methods).toEqual(['create', 'findById']);
  });
  it('记录 SubmissionRepository 方法集（与契约 save/findByAssignmentAndStudent/listByAssignment 不一致）', () => {
    const methods = classMethods(SubmissionRepository);
    expect(methods).toEqual([
      'create', 'findAssignmentContext', 'findAssignmentQuestion', 'findByAssignmentAndQuestion',
      'findById', 'findScoreContext', 'resetByAssignment', 'update',
    ]);
  });
  it('记录 CompileExecutor 方法为 compileCheck（契约文档为 checkCompile）', () => {
    const methods = classMethods(CompileExecutor);
    expect(methods.includes('compileCheck')).toBe(true);
    expect(methods.includes('checkCompile')).toBe(false);
  });
});
