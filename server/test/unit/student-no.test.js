/**
 * student-no.test.js —— 评分审核展示学号归一化（toDisplayStudentNo）。
 *
 * 需求：评分审核页面与导出 Excel 的「学号」必须是纯学号（学校教务系统按纯学号匹配学生），
 * 而账号真值 users.username 仍是「学号@院校代码」——本函数只做响应出口的展示投影。
 */
import { toDisplayStudentNo } from '../../src/utils/studentNo.js';

describe('toDisplayStudentNo —— 展示用纯学号', () => {
  test.each([
    ['2024001@4145013830', '2024001'],
    ['2024001@10001', '2024001'],
    ['2024001', '2024001'],
    ['tmp_abc@10001', 'tmp_abc'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('D1: %p → %p', (input, expected) => {
    expect(toDisplayStudentNo(input)).toBe(expected);
  });

  it('D2: 只去掉最后一个 @ 后缀（学号主体若含 @ 不被截断）', () => {
    expect(toDisplayStudentNo('a@b@10001')).toBe('a@b');
  });

  it('D3: 纯函数、不修改入参', () => {
    const input = '2024001@10001';
    expect(toDisplayStudentNo(input)).toBe('2024001');
    expect(input).toBe('2024001@10001');
  });

  it('D4: 输出永不含 @（教务系统按纯学号匹配的前提）', () => {
    for (const u of ['2024001@10001', 'tmp_x@4145013830', 'plain']) {
      expect(toDisplayStudentNo(u)).not.toContain('@');
    }
  });
});
