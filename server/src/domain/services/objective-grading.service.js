// 客观题评分领域服务（纯函数，零依赖）

// 逐项客观题评分（choice/multi_choice/judge/fill 混合，多选支持 partial 部分给分）
export function gradeObjectiveItems({ items, answers, sqScore, objectiveSettings }) {
  let totalScore = 0;
  let correctCount = 0;
  const feedbackParts = [];
  const itemCount = items.length;

  for (const item of items) {
    const studentItem = (answers || []).find(a => a.key === item.key) || {};
    const studentAns = studentItem.answer || '';
    const itemScore = item.score ?? Math.round(sqScore / itemCount * 100) / 100;

    if (item.type === 'choice') {
      const correct = studentAns.trim() === (item.answer || '').trim();
      if (correct) { totalScore += itemScore; correctCount++; }
      feedbackParts.push('第' + (item.key + 1) + '问：' + (correct ? '✓' : '✗') + '（你的答案: ' + (studentAns || '未作答') + '，正确答案: ' + item.answer + '）');
    } else if (item.type === 'multi_choice') {
      const studentSet = new Set((studentAns || '').split(',').map(s => s.trim()).filter(Boolean));
      const answerSet = new Set((Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim()));
      const correctOpts = [...studentSet].filter(s => answerSet.has(s)).length;
      const wrongOpts = [...studentSet].filter(s => !answerSet.has(s)).length;
      const missingOpts = [...answerSet].filter(s => !studentSet.has(s)).length;
      const settings = objectiveSettings || {};
      if (studentSet.size === 0) {
        feedbackParts.push('第' + (item.key + 1) + '问：✗（未作答）');
      } else if (correctOpts === answerSet.size && wrongOpts === 0) {
        totalScore += itemScore; correctCount++;
        feedbackParts.push('第' + (item.key + 1) + '问：✓（全对）');
      } else {
        const scoring = settings.multiChoiceScoring || 'partial';
        if (scoring === 'partial') {
          const partial = Math.round(itemScore * correctOpts / answerSet.size * 100) / 100;
          totalScore += Math.max(0, partial - wrongOpts);
          feedbackParts.push('第' + (item.key + 1) + '问：△ 部分正确（对' + correctOpts + '错' + wrongOpts + '漏' + missingOpts + '，得' + Math.max(0, partial - wrongOpts) + '/' + itemScore + '分）');
        } else {
          feedbackParts.push('第' + (item.key + 1) + '问：✗（答案: ' + studentAns + '，正确: ' + item.answer + '）');
        }
      }
    } else if (item.type === 'judge') {
      const correct = String(studentAns).trim() === String(item.answer).trim();
      if (correct) { totalScore += itemScore; correctCount++; }
      feedbackParts.push('第' + (item.key + 1) + '问：' + (correct ? '✓' : '✗') + '（你的答案: ' + (studentAns || '未作答') + '，正确答案: ' + (item.answer === 'true' ? '对' : '错') + '）');
    } else if (item.type === 'fill') {
      const refAnswers = String(item.answer || '').split(',').map(s => s.trim());
      const stuAnswers = String(studentAns || '').split(',').map(s => s.trim());
      const blankCount = Math.max(refAnswers.length, stuAnswers.length, 1);
      const perBlankScore = blankCount > 0 ? itemScore / blankCount : itemScore;
      let correctBlanks = 0;
      for (let b = 0; b < blankCount; b++) {
        const sa = String(stuAnswers[b] || '').trim();
        const ra = String(refAnswers[b] || '').trim();
        if (sa.toLowerCase() === ra.toLowerCase()) correctBlanks++;
      }
      const s = correctBlanks * perBlankScore;
      totalScore += s;
      if (correctBlanks === blankCount) correctCount++;
      feedbackParts.push('第' + (item.key + 1) + '问：' + correctBlanks + '/' + blankCount + '空正确（得分 ' + s + '/' + Math.round(itemScore) + '）');
    }
  }

  const score = Math.round(totalScore);
  const feedback = correctCount + '/' + itemCount + ' 正确，得分 ' + totalScore + ' / ' + sqScore + '\n' + feedbackParts.join('\n');
  return { score, feedback, correctCount, itemCount };
}

// 扁平客观题评分（单小题，无逐项结构）
export function gradeFlatObjective({ type, studentAnswer, referenceAnswer, score }) {
  const sa = (studentAnswer || '').trim();
  const ra = (referenceAnswer || '').trim();
  let correct = false;
  let feedback = '';
  if (type === 'multi_choice') {
    const sSet = new Set(sa.split(',').map(s => s.trim()).filter(Boolean));
    const aSet = new Set(ra.split(',').map(s => s.trim()).filter(Boolean));
    correct = sSet.size === aSet.size && [...sSet].every(s => aSet.has(s));
    feedback = correct ? '正确' : '错误，正确答案：' + ra;
  } else if (type === 'fill') {
    const refAnswers = ra.split(',').map(s => s.trim());
    const stuAnswers = sa.split(',').map(s => s.trim());
    const blankCount = Math.max(refAnswers.length, stuAnswers.length, 1);
    correct = blankCount <= 1 ? sa.toLowerCase() === ra.toLowerCase() : false;
    feedback = refAnswers.length > 1 ? '多空题（' + blankCount + '空）请查看详情' : (correct ? '正确' : '错误，参考答案：' + ra);
  } else {
    correct = sa === ra;
    feedback = correct ? '正确' : '错误，正确答案：' + ra;
  }
  return { score: correct ? (score || 0) : 0, feedback, correct };
}

// AI 分数归一化：原始分异常偏高时按满分比例折算
export function normalizeAiScore(score, max) {
  if (score > max * 2 && max < 100) {
    return Math.round(score * max / 100);
  }
  return score;
}