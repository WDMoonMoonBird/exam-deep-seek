# AI 评分性能对比测试报告

**测试日期**：2026-05-29  
**测试环境**：MacBook Air / Node.js / DeepSeek API  
**测试题目**：列表奇数筛选（Assignment #19）

---

## 测试方法

1. 准备 N 条 `status=submitted` 的提交数据
2. **串行模式**：`for (const sub of list) { await gradeOne(sub); }`，每次只处理 1 条
3. **并行模式**：`Promise.all(batch.map(gradeOne))`，每批 8 条并发
4. 两次测试使用完全相同的数据，测试前清空 AI 评分结果重新提交

---

## 总耗时对比

### 100 条提交

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center;">
<thead><tr><th>测试模式</th><th>并发数</th><th>总耗时</th><th>提速比</th></tr></thead>
<tbody>
<tr><td><b>串行</b> <code>for...await</code></td><td>1</td><td><b>390.83 秒</b>（6 分 31 秒）</td><td>基准</td></tr>
<tr><td><b>并行</b> <code>Promise.all</code></td><td>8</td><td><b>103.12 秒</b>（1 分 43 秒）</td><td><b>3.79x</b></td></tr>
</tbody>
</table>

> 时间减少 **73.6%**，节省 **287.71 秒**（约 4 分 48 秒）

### 512 条提交

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center;">
<thead><tr><th>测试模式</th><th>并发数</th><th>总耗时</th><th>提速比</th></tr></thead>
<tbody>
<tr><td><b>串行</b> <code>for...await</code></td><td>1</td><td><b>2230.94 秒</b>（37 分 11 秒）</td><td>基准</td></tr>
<tr><td><b>并行</b> <code>Promise.all</code></td><td>8</td><td><b>392.92 秒</b>（6 分 33 秒）</td><td><b>5.68x</b></td></tr>
</tbody>
</table>

> 时间减少 **82.4%**，节省 **1838.02 秒**（约 30 分 38 秒）

### 汇总

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center;">
<thead><tr><th>数据量</th><th>串行耗时</th><th>8 并行耗时</th><th>提速比</th></tr></thead>
<tbody>
<tr><td>100 条</td><td>6 分 31 秒</td><td>1 分 43 秒</td><td><b>3.79x</b></td></tr>
<tr><td>512 条</td><td>37 分 11 秒</td><td>6 分 33 秒</td><td><b>5.68x</b></td></tr>
</tbody>
</table>

---

## 单次 API 调用耗时分析

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center;">
<thead><tr><th>指标</th><th>100条-串行</th><th>100条-并行</th><th>512条-串行</th><th>512条-并行</th></tr></thead>
<tbody>
<tr><td>平均耗时</td><td>3908 ms</td><td>3932 ms</td><td>4357 ms</td><td>4299 ms</td></tr>
<tr><td>最快</td><td>1674 ms</td><td>1533 ms</td><td>1942 ms</td><td>2109 ms</td></tr>
<tr><td>最慢</td><td>8938 ms</td><td>13558 ms</td><td>12463 ms</td><td>10844 ms</td></tr>
<tr><td>成功率</td><td>100%</td><td>100%</td><td>100%</td><td>100%</td></tr>
</tbody>
</table>

---

## 实际场景预估

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center;">
<thead><tr><th>班级规模</th><th>串行耗时</th><th>并行耗时（8 并发）</th><th>节省</th></tr></thead>
<tbody>
<tr><td>30 人</td><td>~2 分钟</td><td><b>~30 秒</b></td><td>1.5 分钟</td></tr>
<tr><td>50 人</td><td>~3.3 分钟</td><td><b>~50 秒</b></td><td>2.5 分钟</td></tr>
<tr><td>100 人</td><td>~6.5 分钟</td><td><b>~1.7 分钟</b></td><td>4.8 分钟</td></tr>
<tr><td>200 人</td><td>~13 分钟</td><td><b>~3.5 分钟</b></td><td>9.5 分钟</td></tr>
<tr><td>500 人</td><td>~36 分钟</td><td><b>~6.4 分钟</b></td><td>29.6 分钟</td></tr>
</tbody>
</table>

---

## 关键发现

1. **数据量越大，并行优势越明显**：100 条提速 3.79 倍，512 条提速 5.68 倍，接近理论值 8 倍的 71%
2. **单次 API 耗时基本稳定**（~4 秒），DeepSeek API 在 8 并发下无性能衰减
3. **成功率 100%**，所有测试均无失败，8 并发未导致 API 错误增加
4. 512 条串行耗时超过 37 分钟，实际教学场景中完全不可接受；并行降至 6.5 分钟，实用可行

---

## 结论

Worker 从串行改为 8 并发后，评分效率提升显著且随数据量增大而更明显。对于实际教学场景：

- **单班**（40-60 人）：全部交卷后 **1 分钟内**完成评分
- **年级统考**（500 人）：**6.5 分钟**完成评分，远优于串行的 37 分钟

推荐在生产环境保持 **8 并发**配置。
