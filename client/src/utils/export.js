import * as XLSX from 'xlsx';

export function exportReviewXlsx(apiData, className, assignmentTitle) {
  const { rows, subQuestions } = apiData;

  // 构建表头: 姓名, 学号, 学校, 班级, 已交/未交, 小题1(25分), 小题2(25分), ..., 总分
  const headers = ['姓名', '学号', '学校', '班级', '已交/未交'];
  for (const sq of (subQuestions || [])) {
    headers.push(`${sq.title}(${sq.score}分)`);
  }
  headers.push('总分');

  const data = rows.map(r => {
    const row = {
      '姓名': r.studentName || '',
      '学号': r.studentNo || '',
      '学校': r.schoolName || '',
      '班级': r.className || '',
      '已交/未交': r.submitted ? '已交' : '未交',
    };
    for (const sq of (r.subScores || [])) {
      const key = `${sq.title}(${sq.maxScore}分)`;
      row[key] = sq.submitted ? (sq.score ?? 0) : '未交';
    }
    row['总分'] = r.totalScore ?? '';
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws['!cols'] = headers.map(h => ({ wch: h.length > 10 ? 18 : 10 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const filename = `${className} ${assignmentTitle}情况.xlsx`;
  XLSX.writeFile(wb, filename);
}
