import {
  DomainError, InvalidScoreError, SubmissionClosedError,
  DuplicateSubmissionError, EntityNotFoundError, IllegalStateError,
} from '../../../src/domain/errors.js';

describe('DomainError 基类', () => {
  it('默认 code=DOMAIN_ERROR、name=DomainError、message 透传', () => {
    const e = new DomainError('出错了');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(DomainError);
    expect(e.name).toBe('DomainError');
    expect(e.code).toBe('DOMAIN_ERROR');
    expect(e.message).toBe('出错了');
  });

  it('可传入自定义 code', () => {
    const e = new DomainError('出错了', 'CUSTOM_CODE');
    expect(e.code).toBe('CUSTOM_CODE');
  });
});

describe('DomainError 子类体系（错误分类 + 稳定 code + name）', () => {
  const cases = [
    [InvalidScoreError, 'InvalidScoreError', 'INVALID_SCORE'],
    [SubmissionClosedError, 'SubmissionClosedError', 'SUBMISSION_CLOSED'],
    [DuplicateSubmissionError, 'DuplicateSubmissionError', 'DUPLICATE_SUBMISSION'],
    [EntityNotFoundError, 'EntityNotFoundError', 'ENTITY_NOT_FOUND'],
    [IllegalStateError, 'IllegalStateError', 'ILLEGAL_STATE'],
  ];
  for (const [Klass, name, code] of cases) {
    it(name + ' → instanceof DomainError/Error、code=' + code, () => {
      const e = new Klass('消息');
      expect(e).toBeInstanceOf(DomainError);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe(name);
      expect(e.code).toBe(code);
      expect(e.message).toBe('消息');
    });
  }
});
