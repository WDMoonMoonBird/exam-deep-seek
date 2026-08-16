/**
 * compose —— 组合根（Composition Root）：集中装配应用用例与基础设施适配器。
 * 由 app.js 调用并把结果挂到 app.locals；controller 经 req.app.locals 取用。
 * 新增用例/适配器只改本文件，不改 controller 与路由。
 */

import { ReviewUseCases } from '../../application/use-cases/review.use-cases.js';
import { QuestionUseCases } from '../../application/use-cases/question.use-cases.js';
import { SubmissionUseCases } from '../../application/use-cases/submission.use-cases.js';
import { SubmissionRepository } from '../persistence/submission.repository.js';
import { QuestionRepository } from '../persistence/question.repository.js';
import { SystemConfigRepository } from '../persistence/system-config.repository.js';
import { DeepSeekGateway } from '../ai/deepseek-gateway.js';
import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { SocketNotifier } from '../notifier/socket-notifier.js';
import { InMemoryRateLimiter } from '../rate-limit/in-memory-rate-limiter.js';

/**
 * @param {object} deps
 * @param {object} deps.prisma Prisma Client
 * @param {object} deps.logger pino
 * @returns {object} 装配好的依赖（挂 app.locals）
 */
export function compose({ prisma, logger }) {
  const configRepo = new SystemConfigRepository({ prisma, logger });
  const aiGateway = new DeepSeekGateway({ configRepo, logger });
  const eventBus = new InMemoryEventBus();
  const socketNotifier = new SocketNotifier();
  const rateLimiter = new InMemoryRateLimiter();
  return {
    reviewUseCases: new ReviewUseCases({ submissionRepo: new SubmissionRepository({ prisma }), aiGateway, logger }),
    questionUseCases: new QuestionUseCases({ questionRepo: new QuestionRepository({ prisma }), logger }),
    submissionUseCases: new SubmissionUseCases({ submissionRepo: new SubmissionRepository({ prisma }), logger }),
    aiGateway,
    configRepo,
    eventBus,
    socketNotifier,
    rateLimiter,
  };
}