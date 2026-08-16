import * as XLSX from 'xlsx';

export function exportReviewXlsx(apiData, className, assignmentTitle) {
  const { rows, headerCells } = apiData;

  // 表头：姓名, 学号, 学校, 班级, 状态, 总分, 各小题列...
  const headers = ['姓名', '学号', '学校', '班级', '状态', '总分'];
  for (const h of (headerCells || [])) {
    headers.push(`${h.label}（${h.maxScore}分）`);
  }

  const data = rows.map(r => {
    const row = {
      '姓名': r.studentName || '',
      '学号': r.studentNo || '',
      '学校': r.schoolName || '',
      '班级': r.className || '',
      '状态': r.submitted ? '已交' : '未交',
      '总分': r.totalScore != null ? r.totalScore : '',
    };
    for (let i = 0; i < (headerCells || []).length; i++) {
      const h = headerCells[i];
      const c = (r.cellScores || [])[i];
      const label = `${h.label}（${h.maxScore}分）`;
      if (!c || !c.submitted) {
        row[label] = '未交';
      } else {
        row[label] = c.score != null ? c.score : 0;
      }
    }
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });

  // 列宽
  ws['!cols'] = headers.map((h, i) => {
    if (i <= 3) return { wch: 12 }; // 姓名/学号/学校/班级
    if (i === 4) return { wch: 8 };  // 状态
    if (i === 5) return { wch: 10 }; // 总分
    return { wch: Math.min(h.length, 30) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const filename = `${className}-${assignmentTitle}.xlsx`;
  XLSX.writeFile(wb, filename);
}
