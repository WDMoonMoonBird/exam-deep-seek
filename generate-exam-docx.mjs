import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, TabStopPosition, TabStopType,
  NumberFormat, LevelFormat,
} from "docx";
import * as fs from "fs";
import * as path from "path";

// Helper: bold + size paragraph
function boldPara(text, size = 28, align = AlignmentType.CENTER) {
  return new Paragraph({
    alignment: align,
    children: [new TextRun({ text, bold: true, size, font: "SimSun" })],
    spacing: { after: 200 },
  });
}

// Helper: section title
function sectionTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [
      new TextRun({ text, bold: true, size: 26, font: "SimSun" }),
    ],
    spacing: { before: 300, after: 150 },
  });
}

// Helper: single-choice question
function singleChoice(num, stem, options, answer) {
  const runs = [
    new TextRun({ text: `${num}. ${stem}`, size: 22, font: "SimSun" }),
  ];
  for (const opt of options) {
    runs.push(new TextRun({ text: `  ${opt}  `, size: 22, font: "SimSun" }));
  }
  runs.push(new TextRun({ break: 1 }));
  runs.push(new TextRun({ text: `答案：${answer}`, size: 22, font: "SimSun", bold: true }));
  return new Paragraph({
    spacing: { after: 80 },
    children: runs,
  });
}

// Helper: multi-choice question
function multiChoice(num, stem, options, answer) {
  const runs = [
    new TextRun({ text: `${num}. ${stem}`, size: 22, font: "SimSun" }),
  ];
  for (const opt of options) {
    runs.push(new TextRun({ text: `  ${opt}  `, size: 22, font: "SimSun" }));
  }
  runs.push(new TextRun({ break: 1 }));
  runs.push(new TextRun({ text: `答案：${answer}`, size: 22, font: "SimSun", bold: true }));
  return new Paragraph({
    spacing: { after: 80 },
    children: runs,
  });
}

// Helper: fill-in-the-blank question
function fillBlank(num, stem, answer) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `${num}. ${stem}`, size: 22, font: "SimSun" }),
      new TextRun({ break: 1 }),
      new TextRun({ text: `答案：${answer}`, size: 22, font: "SimSun", bold: true }),
    ],
  });
}

// Helper: subjective question
function subjective(num, content) {
  const runs = [
    new TextRun({ text: `${num}. ${content.title || ""}`, size: 22, font: "SimSun", bold: true }),
    new TextRun({ break: 1 }),
  ];
  if (content.referenceAnswer) {
    runs.push(new TextRun({ text: `参考答案：${content.referenceAnswer}`, size: 22, font: "SimSun" }));
    runs.push(new TextRun({ break: 1 }));
  }
  if (content.scoring) {
    runs.push(new TextRun({ text: `评分标准：${content.scoring}`, size: 22, font: "SimSun" }));
  }
  return new Paragraph({
    spacing: { after: 120 },
    children: runs,
  });
}

// ─── Single-choice questions ───
const singleChoiceQuestions = [
  {
    stem: "C#中值类型存储在什么位置？",
    options: ["A. 堆", "B. 栈", "C. 寄存器", "D. 静态区"],
    answer: "B",
  },
  {
    stem: "以下哪个是C#中声明委托的关键字？",
    options: ["A. delegate", "B. event", "C. action", "D. func"],
    answer: "A",
  },
  {
    stem: "C#中using语句的作用是？",
    options: ["A. 引入命名空间", "B. 自动释放资源", "C. 声明变量", "D. A和B都对"],
    answer: "D",
  },
  {
    stem: "LINQ的全称是什么？",
    options: ["A. Language Integrated Query", "B. Language Integer Query", "C. List Integrated Query", "D. Language Inter Query"],
    answer: "A",
  },
  {
    stem: "以下哪个是C#中的特性(Attribute)类？",
    options: ["A. System.Attribute", "B. System.Feature", "C. System.Tag", "D. System.Mark"],
    answer: "A",
  },
  {
    stem: "C#中async/await用于什么场景？",
    options: ["A. 反射", "B. 异步编程", "C. 序列化", "D. 加密"],
    answer: "B",
  },
  {
    stem: "以下哪个集合类线程安全？",
    options: ["A. List<T>", "B. Dictionary<K,V>", "C. ConcurrentDictionary<K,V>", "D. Queue<T>"],
    answer: "C",
  },
  {
    stem: "C#中扩展方法必须定义在什么类型的类中？",
    options: ["A. 静态类", "B. 密封类", "C. 抽象类", "D. 普通类"],
    answer: "A",
  },
  {
    stem: "var关键字在C#中表示什么？",
    options: ["A. 动态类型", "B. 隐式类型推断", "C. 可变类型", "D. 无类型"],
    answer: "B",
  },
  {
    stem: "以下哪个是C#中定义属性的正确语法？",
    options: ["A. int Name { get; set; }", "B. property int Name", "C. int Name()", "D. attr int Name"],
    answer: "A",
  },
];

// ─── Multi-choice questions ───
const multiChoiceQuestions = [
  {
    stem: "以下哪些是.NET支持的编程语言？",
    options: ["A. C#", "B. F#", "C. VB.NET", "D. Java"],
    answer: "A,B,C",
  },
  {
    stem: "以下哪些是C#的访问修饰符？",
    options: ["A. public", "B. internal", "C. protected internal", "D. friendly"],
    answer: "A,B,C",
  },
  {
    stem: "以下哪些属于C#的值类型？",
    options: ["A. int", "B. struct", "C. class", "D. enum"],
    answer: "A,B,D",
  },
  {
    stem: "以下哪些设计模式在C#中常用？",
    options: ["A. 单例模式", "B. 工厂模式", "C. 观察者模式", "D. 管道模式"],
    answer: "A,B,C",
  },
  {
    stem: "以下哪些是合法的LINQ操作符？",
    options: ["A. Select", "B. Where", "C. OrderBy", "D. Insert"],
    answer: "A,B,C",
  },
  {
    stem: "以下哪些是.NET Core的特点？",
    options: ["A. 跨平台", "B. 开源", "C. 高性能", "D. 仅限Windows"],
    answer: "A,B,C",
  },
  {
    stem: "以下哪些方式可以实现多线程编程？",
    options: ["A. Thread类", "B. Task类", "C. async/await", "D. GOTO语句"],
    answer: "A,B,C",
  },
  {
    stem: "C#中以下哪些类型是引用类型？",
    options: ["A. string", "B. class", "C. delegate", "D. int"],
    answer: "A,B,C",
  },
  {
    stem: "以下哪些属于SOLID原则？",
    options: ["A. 单一职责原则", "B. 开闭原则", "C. 接口隔离原则", "D. 极限编程原则"],
    answer: "A,B,C",
  },
  {
    stem: "以下哪些是C# 8.0的新特性？",
    options: ["A. Nullable Reference Types", "B. Switch Expressions", "C. Default Interface Methods", "D. Pointers"],
    answer: "A,B,C",
  },
];

// ─── Fill-in-the-blank questions ───
const fillBlankQuestions = [
  {
    stem: 'C#中声明一个不可为null的字符串变量：______ name = "hello";',
    answer: "string",
  },
  {
    stem: "LINQ中用于筛选数据的操作符是 ______。",
    answer: "Where",
  },
  {
    stem: "C#中抛出异常使用关键字 ______。",
    answer: "throw",
  },
  {
    stem: ".NET中用于序列化JSON的常用库是 ______。",
    answer: "Newtonsoft.Json",
  },
  {
    stem: "C#中定义泛型方法的语法是在方法名后加 ______。",
    answer: "<T>",
  },
  {
    stem: "async方法必须返回 ______、______ 或 void 类型。",
    answer: "Task,Task<T>",
  },
  {
    stem: "C#中可以使用 ______ 语法为已有类型添加新方法。",
    answer: "扩展方法",
  },
  {
    stem: "Lambda表达式中 => 符号称为 ______ 运算符。",
    answer: "Lambda",
  },
  {
    stem: "C#中获取类型信息使用 ______ 关键字。",
    answer: "typeof",
  },
  {
    stem: "using语句确保实现了 ______ 接口的对象在离开作用域时被正确释放。",
    answer: "IDisposable",
  },
];

// ─── Subjective questions ───
const subjectiveQuestions = [
  {
    title: "请编写C#代码，使用LINQ查询一个整数列表中所有大于50的偶数，按降序排列并输出结果。",
    referenceAnswer:
      "使用List<int>存储整数，通过Where筛选偶数且大于50，使用OrderByDescending降序排列，ToList输出结果。",
    scoring: "代码正确性(60%) + 代码效率(20%) + 代码可读性(20%)",
  },
  {
    title: "请编写一个C#泛型方法，实现两个同类型变量的值交换。",
    referenceAnswer:
      "定义泛型方法Swap<T>(ref T a, ref T b)，使用临时变量完成值交换。",
    scoring: "代码正确性(60%) + 代码效率(20%) + 代码可读性(20%)",
  },
  {
    title: "请编写C#代码，使用异步方法async/await模拟从三个不同数据源获取数据并合并结果，每个数据源获取耗时模拟为不同的延迟时间。",
    referenceAnswer:
      "创建三个async方法返回不同数据，使用Task.WhenAll并行获取，合并结果后返回。",
    scoring: "代码正确性(60%) + 代码效率(20%) + 代码可读性(20%)",
  },
  {
    title: "请编写一个C#简单计算器类(Calculator)，支持加、减、乘、除四则运算，要求使用委托或事件机制处理运算操作，并包含除零异常处理。",
    referenceAnswer:
      "定义Calculator类，使用Func<T>委托或自定义委托实现运算，添加try-catch处理DivideByZeroException。",
    scoring: "代码正确性(60%) + 代码效率(20%) + 代码可读性(20%)",
  },
  {
    title: "请编写C#代码实现一个简单的观察者模式：定义一个Subject类（主题）和多个Observer类（观察者），当Subject状态改变时通知所有Observer。",
    referenceAnswer:
      "定义ISubject和IObserver接口，Subject维护观察者列表并实现Notify方法，Observer实现Update方法。",
    scoring: "代码正确性(60%) + 代码效率(20%) + 代码可读性(20%)",
  },
];

// ─── Build document ───
const children = [];

// Title
children.push(boldPara("C#程序设计期末考试", 36));

// ─── Section 1 ───
children.push(sectionTitle("一、单项选择题（每题2分，共10题）"));
singleChoiceQuestions.forEach((q, i) => {
  children.push(singleChoice(i + 1, q.stem, q.options, q.answer));
});

// ─── Section 2 ───
children.push(sectionTitle("二、多项选择题（每题3分，共10题，少选得1分，多选错选不得分）"));
multiChoiceQuestions.forEach((q, i) => {
  children.push(multiChoice(i + 1, q.stem, q.options, q.answer));
});

// ─── Section 3 ───
children.push(sectionTitle("三、填空题（每题2分，共10题）"));
fillBlankQuestions.forEach((q, i) => {
  children.push(fillBlank(i + 1, q.stem, q.answer));
});

// ─── Section 4 ───
children.push(sectionTitle("四、主观题（每题20分，共5题）"));
subjectiveQuestions.forEach((q, i) => {
  children.push(subjective(i + 1, q));
});

const doc = new Document({
  sections: [
    {
      properties: {},
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
// 输出目录：默认当前目录，可用 CLI 参数（第 1 个）或环境变量 DOCX_OUTPUT_DIR 覆盖
const outputDir = process.env.DOCX_OUTPUT_DIR || process.argv[2] || './';
const outputPath = path.join(outputDir, 'C#期末考试.docx');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buffer);
console.log(`Document saved to: ${outputPath}`);
