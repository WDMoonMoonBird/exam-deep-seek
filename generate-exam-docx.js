const docx = require("docx");
const fs = require("fs");
const path = require("path");

const {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  BorderStyle,
  TabStopPosition,
  TabStopType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
  ShadingType,
} = docx;

// Helper: create a bold text run
function bold(text, options = {}) {
  return new TextRun({ text, bold: true, ...options });
}

// Helper: create a normal text run
function normal(text, options = {}) {
  return new TextRun({ text, ...options });
}

// Helper: create a heading paragraph
function heading(text, level) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, font: "SimHei" })],
    spacing: { before: 360, after: 200 },
  });
}

// Helper: create a question paragraph with answer
function question(Q, options = {}) {
  const children = [];
  // question number + text
  children.push(new TextRun({ text: `${Q.num}. ${Q.text}`, bold: false, font: "SimSun", size: 22 }));
  if (Q.options && Q.options.length > 0) {
    children.push(new TextRun({ text: "\n", size: 22 }));
    children.push(new TextRun({ text: Q.options.join("  "), font: "SimSun", size: 22 }));
  }
  children.push(new TextRun({ text: "\n", size: 22 }));
  children.push(new TextRun({ text: `答案：${Q.answer}`, bold: true, color: "333333", font: "SimSun", size: 22 }));
  return new Paragraph({
    children,
    spacing: { after: 200, line: 360 },
    ...options,
  });
}

// Helper: create a subjective question
function subjective(Q) {
  const children = [];
  children.push(new TextRun({ text: `${Q.num}. ${Q.text}`, bold: false, font: "SimSun", size: 22 }));
  children.push(new TextRun({ text: "\n", size: 22 }));
  children.push(new TextRun({ text: `参考答案：${Q.reference}`, bold: false, font: "SimSun", size: 22 }));
  children.push(new TextRun({ text: "\n", size: 22 }));
  children.push(new TextRun({ text: `评分标准：`, bold: true, font: "SimSun", size: 22 }));
  children.push(new TextRun({ text: "\n", size: 18 }));
  for (const item of Q.rubric) {
    children.push(new TextRun({ text: `${item}`, font: "SimSun", size: 22 }));
    children.push(new TextRun({ text: "\n", size: 18 }));
  }
  return new Paragraph({
    children,
    spacing: { after: 300, line: 360 },
  });
}

// Helper: create tf (true/false) question
function tfQuestion(Q) {
  const children = [];
  children.push(new TextRun({ text: `${Q.num}. ${Q.text}`, bold: false, font: "SimSun", size: 22 }));
  if (Q.options && Q.options.length > 0) {
    children.push(new TextRun({ text: "\n", size: 22 }));
    children.push(new TextRun({ text: Q.options.join("  "), font: "SimSun", size: 22 }));
  }
  children.push(new TextRun({ text: "\n", size: 22 }));
  children.push(new TextRun({ text: `答案：${Q.answer}`, bold: true, color: "333333", font: "SimSun", size: 22 }));
  return new Paragraph({
    children,
    spacing: { after: 200, line: 360 },
  });
}

// ============ Data ============

const singleChoiceQs = [
  { num: 1, text: "Java中int类型占几个字节？", options: ["A. 2  B. 4  C. 8  D. 1"], answer: "B" },
  { num: 2, text: "以下哪个是合法的Java标识符？", options: ["A. 2var  B. _count  C. class  D. void"], answer: "B" },
  { num: 3, text: "Java程序中main方法的声明正确的是？", options: ["A. public static void main(String[] args)  B. public void main(String[] args)  C. public static int main(String[] args)  D. static void main(String[] args)"], answer: "A" },
  { num: 4, text: "下面哪个关键字用于实现继承？", options: ["A. interface  B. extends  C. implements  D. abstract"], answer: "B" },
  { num: 5, text: "在Java中，Object类是？", options: ["A. 接口  B. 抽象类  C. 所有类的父类  D. final类"], answer: "C" },
  { num: 6, text: "以下哪个集合类允许重复元素？", options: ["A. Set  B. Map  C. List  D. TreeSet"], answer: "C" },
  { num: 7, text: "Java中的String类型是什么？", options: ["A. 基本类型  B. 引用类型  C. 数组类型  D. 字符类型"], answer: "B" },
  { num: 8, text: "下列哪个修饰符表示私有？", options: ["A. public  B. protected  C. private  D. default"], answer: "C" },
  { num: 9, text: "try-catch-finally中，finally块什么时候执行？", options: ["A. 异常发生时才执行  B. 无论异常发生与否都会执行  C. 只在try块执行完后执行  D. 永不执行"], answer: "B" },
  { num: 10, text: "下面哪个是Java的垃圾回收方法？", options: ["A. finalize()  B. delete()  C. destroy()  D. System.gc()"], answer: "D" },
  { num: 11, text: "Java接口中方法默认的修饰符是？", options: ["A. public  B. private  C. protected  D. default"], answer: "A" },
  { num: 12, text: "ArrayList的底层数据结构是什么？", options: ["A. 链表  B. 数组  C. 哈希表  D. 树"], answer: "B" },
  { num: 13, text: "以下哪个不是Java的访问修饰符？", options: ["A. public  B. private  C. friendly  D. protected"], answer: "C" },
  { num: 14, text: "Java中，子类能直接访问父类的哪个成员？", options: ["A. private  B. protected  C. 都不能  D. 只能通过方法"], answer: "B" },
  { num: 15, text: "以下哪个是正确的for-each语法？", options: ["A. for(int i : arr)  B. for(int i : arr[])  C. for(int i in arr)  D. for(i : arr)"], answer: "A" },
  { num: 16, text: "Java中抽象类可以实例化吗？", options: ["A. 可以  B. 不可以  C. 只能实例化一次  D. 取决于修饰符"], answer: "B" },
  { num: 17, text: "方法重载(overload)的判断依据是？", options: ["A. 返回值类型  B. 方法名+参数列表  C. 访问修饰符  D. 异常声明"], answer: "B" },
  { num: 18, text: "HashMap的key和value分别是什么？", options: ["A. key可为null，value不可为null  B. key不可为null，value可为null  C. key可为null，value可为null  D. 都不可为null"], answer: "C" },
  { num: 19, text: "以下哪个包包含数据流操作类？", options: ["A. java.lang  B. java.util  C. java.io  D. java.net"], answer: "C" },
  { num: 20, text: "Java中多态的实现不依赖以下哪个？", options: ["A. 继承  B. 接口  C. 方法重写  D. 方法重载"], answer: "D" },
];

const tfQuestions = [
  { num: 1, text: "Java是一种编译型语言。（判断正误，正确打√，错误打×）", options: [], answer: "错误" },
  { num: 2, text: "float类型的值声明时必须加f后缀。", options: [], answer: "正确" },
  { num: 3, text: "静态方法中可以直接访问实例变量。", options: [], answer: "错误" },
  { num: 4, text: "super关键字用于调用父类构造方法。", options: [], answer: "正确" },
  { num: 5, text: "Java中循环语句只有for和while两种。", options: [], answer: "错误" },
  { num: 6, text: "构造方法可以有返回值。", options: [], answer: "错误" },
  { num: 7, text: "抽象类中可以有非抽象方法。", options: [], answer: "正确" },
  { num: 8, text: "一个Java源文件只能包含一个public类。", options: [], answer: "正确" },
  { num: 9, text: "char类型占用2个字节。", options: [], answer: "正确" },
  { num: 10, text: "static方法可以被对象实例调用，但不推荐。", options: [], answer: "正确" },
];

const subjectiveQs = [
  {
    num: 1,
    text: "请编写一个Java方法，实现冒泡排序算法，对整数数组进行升序排列。",
    reference: "使用双重循环，外层控制轮数，内层进行相邻元素比较交换，并添加优化标志位。",
    rubric: [
      "代码正确性（60%）：冒泡排序逻辑正确，升序排列",
      "代码效率（20%）：添加提前退出优化",
      "代码可读性（20%）：命名规范，注释清晰",
    ],
  },
  {
    num: 2,
    text: "请编写一个Java类，实现单例模式（饿汉式或懒汉式均可），并说明该模式的应用场景。",
    reference: "懒汉式使用双重检查锁定确保线程安全，饿汉式使用静态常量初始化。",
    rubric: [
      "代码正确性（60%）：单例模式实现正确，私有构造方法，唯一实例",
      "代码效率（20%）：线程安全考虑",
      "代码可读性（20%）：注释说明应用场景",
    ],
  },
  {
    num: 3,
    text: "请编写代码，使用多线程计算1到100000的和，要求将任务分配给两个线程，每个线程计算一半范围，最后合并结果。",
    reference: "创建一个类实现Runnable接口，使用Thread创建两个线程分别计算，使用join等待线程完成。",
    rubric: [
      "代码正确性（60%）：多线程分治计算，结果正确",
      "代码效率（20%）：合理的线程分工",
      "代码可读性（20%）：命名清晰，逻辑易懂",
    ],
  },
  {
    num: 4,
    text: "请设计一个简单的学生信息管理系统，包含Student类（属性：学号、姓名、成绩数组）和实现按总分降序排序的功能。要求使用ArrayList存储学生对象。",
    reference: "Student类包含学号、姓名、成绩数组，实现Comparable接口或使用Comparator进行总分比较排序。",
    rubric: [
      "代码正确性（60%）：Student类设计合理，排序功能正确",
      "代码效率（20%）：选择合适的排序方式",
      "代码可读性（20%）：封装合理，命名规范",
    ],
  },
  {
    num: 5,
    text: "请编写代码实现文件读写功能：从文本文件读取内容，统计每个单词出现的次数，并将结果写入另一个文件。",
    reference: "使用BufferedReader逐行读取，HashMap存储单词计数，BufferedWriter写入结果。",
    rubric: [
      "代码正确性（60%）：文件读取、单词统计、结果写入功能完整",
      "代码效率（20%）：使用缓冲流提升效率",
      "代码可读性（20%）：异常处理完善，代码结构清晰",
    ],
  },
];

// ============ Build Document ============

const sections = [];

// Title
sections.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({
        text: "Java程序设计期末考试",
        bold: true,
        size: 36,
        font: "SimHei",
      }),
    ],
  })
);

// Section 1: 单项选择题
sections.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: "一、单项选择题（每题2分，共20题）", bold: true, font: "SimHei", size: 28 })],
    spacing: { before: 400, after: 300 },
  })
);

for (const q of singleChoiceQs) {
  sections.push(question(q));
}

// Page break before next section
sections.push(new Paragraph({ children: [new PageBreak()] }));

// Section 2: 判断题
sections.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: "二、判断题（每题1分，共10题）", bold: true, font: "SimHei", size: 28 })],
    spacing: { before: 400, after: 300 },
  })
);

for (const q of tfQuestions) {
  sections.push(tfQuestion(q));
}

// Page break before next section
sections.push(new Paragraph({ children: [new PageBreak()] }));

// Section 3: 主观题
sections.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: "三、主观题（每题20分，共5题）", bold: true, font: "SimHei", size: 28 })],
    spacing: { before: 400, after: 300 },
  })
);

for (const q of subjectiveQs) {
  sections.push(subjective(q));
}

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 1440, // 1 inch
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      children: sections,
    },
  ],
});

// ============ Generate and save ============

// 输出目录：默认当前目录，可用 CLI 参数（第 1 个）或环境变量 DOCX_OUTPUT_DIR 覆盖
const outputDir = process.env.DOCX_OUTPUT_DIR || process.argv[2] || './';
const outputPath = path.join(outputDir, 'Java期末考试.docx');

Packer.toBuffer(doc).then((buffer) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log(`Document saved to: ${outputPath}`);
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
});
