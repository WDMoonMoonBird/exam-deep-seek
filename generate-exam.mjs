// 生成 Java 考试试卷 Word 文档
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, NumberProperties } from 'docx';
import fs from 'fs';

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      // 标题
      new Paragraph({ text: 'Java 程序设计期末考试', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '满分：100 分 | 考试时间：120 分钟', alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
      new Paragraph({ text: '注意事项：请将答案写在答题卡上，编程题写出完整代码。', spacing: { after: 400 } }),

      ...['一、单选题（每题 2 分，共 10 题）', '1. Java 中 int 类型占用的字节数是？',
        'A. 2 字节', 'B. 4 字节', 'C. 8 字节', 'D. 1 字节', '答案：B',
        '2. 以下哪个关键字用于创建对象？', 'A. new', 'B. class', 'C. void', 'D. static', '答案：A',
        '3. Java 中所有类的父类是？', 'A. Object', 'B. Class', 'C. String', 'D. System', '答案：A',
        '4. 以下哪个修饰符表示方法可以被重写？', 'A. final', 'B. static', 'C. private', 'D. 无修饰符', '答案：D',
        '5. ArrayList 位于哪个包？', 'A. java.lang', 'B. java.io', 'C. java.util', 'D. java.net', '答案：C',
        '6. try-catch 中 finally 代码块的作用是？',
        'A. 仅异常时执行', 'B. 无论是否异常都执行', 'C. 异常时不执行', 'D. 捕获异常', '答案：B',
        '7. 以下代码输出是什么？\n  int x = 5;\n  System.out.println(x++);',
        'A. 4', 'B. 5', 'C. 6', 'D. 编译错误', '答案：B',
        '8. 接口中方法的默认修饰符是？',
        'A. private', 'B. protected', 'C. public abstract', 'D. static', '答案：C',
        '9. 以下哪个不是 Java 的基本数据类型？',
        'A. int', 'B. float', 'C. String', 'D. boolean', '答案：C',
        '10. HashMap 中键是否可以重复？',
        'A. 可以', 'B. 不可以', 'C. 看情况', 'D. 只有 String 键不可以', '答案：B',

        '', '二、多选题（每题 3 分，共 10 题）',
        '11. 以下哪些是 Java 的访问修饰符？',
        'A. public', 'B. private', 'C. protected', 'D. friendly', '答案：A,B,C',
        '12. 以下哪些集合类线程安全？',
        'A. Vector', 'B. ArrayList', 'C. Hashtable', 'D. ConcurrentHashMap', '答案：A,C,D',
        '13. 关于抽象类，以下说法正确的有？',
        'A. 可以被实例化', 'B. 可以有构造方法', 'C. 可以有普通方法', 'D. 子类必须重写所有抽象方法', '答案：B,C',
        '14. 以下哪些方法属于 Object 类？',
        'A. equals()', 'B. hashCode()', 'C. toString()', 'D. clone()', '答案：A,B,C,D',
        '15. Java 中创建线程的方式有哪些？',
        'A. 继承 Thread 类', 'B. 实现 Runnable 接口', 'C. 实现 Callable 接口', 'D. 使用 ExecutorService', '答案：A,B,C,D',
        '16. 以下哪些是正确的异常处理方式？',
        'A. try-catch', 'B. try-finally', 'C. try-catch-finally', 'D. try-with-resources', '答案：A,C,D',
        '17. 关于 static 关键字，正确的是？',
        'A. 静态方法可直接调用', 'B. 静态变量属于类', 'C. 静态方法可访问 this', 'D. 静态代码块类加载时执行', '答案：A,B,D',
        '18. 以下哪些是合法的 lambda 表达式？',
        'A. () -> System.out.println("hi")', 'B. (x,y) -> x+y', 'C. x -> x*x', 'D. (int a) -> a+1', '答案：A,B,C',
        '19. Stream API 的终端操作有哪些？',
        'A. collect()', 'B. forEach()', 'C. filter()', 'D. map()', '答案：A,B',
        '20. 关于泛型，正确的有？',
        'A. List<String> 类型安全', 'B. 泛型支持基本类型', 'C. ? extends T 表示上界', 'D. 泛型信息编译后擦除', '答案：A,C,D',

        '', '三、判断题（每题 1 分，共 10 题）',
        '21. Java 支持多继承。', '错误',
        '22. String 是不可变对象。', '正确',
        '23. == 和 equals() 在比较对象时结果总是相同。', '错误',
        '24. synchronized 关键字可以用于方法上。', '正确',
        '25. finally 代码块一定会被执行。', '错误',
        '26. JVM 自动进行垃圾回收。', '正确',
        '27. 接口中可以有默认方法（default method）。', '正确',
        '28. throw 和 throws 的作用完全相同。', '错误',
        '29. volatile 关键字可以保证原子性。', '错误',
        '30. StringBuilder 是线程安全的。', '错误',

        '', '四、填空题（每题 2 分，共 10 题）',
        '31. Java 编译后的字节码文件后缀是 ______。', '答案：.class',
        '32. 创建对象使用的关键字是 ______。', '答案：new',
        '33. main 方法的完整声明是 public static void main(______ args)。', '答案：String[]',
        '34. 获取数组长度使用的属性是 ______。', '答案：length',
        '35. 将字符串转为整数使用 Integer.______() 方法。', '答案：parseInt',
        '36. List 接口的实现类有 ArrayList 和 ______。', '答案：LinkedList',
        '37. Java 中表示当前对象的关键字是 ______。', '答案：this',
        '38. 异常分为受检异常和 ______ 异常。', '答案：运行时',
        '39. 使用 ______ 注解标记一个方法为测试方法（JUnit）。', '答案：@Test',
        '40. 线程调用 ______ 方法后进入就绪状态。', '答案：start',

        '', '五、编程题（共 5 题）',
        '41. 编写一个方法，接收一个整数数组，返回数组中的最大值。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '参考答案：\npublic static int findMax(int[] arr) {\n    if (arr == null || arr.length == 0) throw new IllegalArgumentException("数组不能为空");\n    int max = arr[0];\n    for (int i = 1; i < arr.length; i++) {\n        if (arr[i] > max) max = arr[i];\n    }\n    return max;\n}',
        '42. 编写一个方法，实现字符串反转功能，输入一个字符串返回反转后的字符串。（8 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '参考答案：\npublic static String reverse(String str) {\n    if (str == null) return null;\n    return new StringBuilder(str).reverse().toString();\n}',
        '43. 编写一个 Student 类，包含 name、age 属性，提供构造方法和 getter/setter，并重写 toString 方法。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '参考答案：\npublic class Student {\n    private String name;\n    private int age;\n    public Student(String name, int age) { this.name = name; this.age = age; }\n    public String getName() { return name; }\n    public void setName(String name) { this.name = name; }\n    public int getAge() { return age; }\n    public void setAge(int age) { this.age = age; }\n    @Override\n    public String toString() { return "Student{name=\'" + name + "\', age=" + age + "}"; }\n}',
        '44. 编写一个方法，读取文本文件内容并按行打印到控制台。（12 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '参考答案：\nimport java.io.*;\npublic static void readFileByLine(String filePath) throws IOException {\n    try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {\n        String line;\n        while ((line = br.readLine()) != null) {\n            System.out.println(line);\n        }\n    }\n}',
        '45. 编写一个简单的多线程程序，创建两个线程分别打印奇数和偶数（1～100）。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '参考答案：\npublic class PrintNumbers {\n    private static int num = 1;\n    private static final Object lock = new Object();\n    public static void main(String[] args) {\n        new Thread(() -> { while (num <= 100) { synchronized(lock) { if (num % 2 == 1) System.out.println("奇数:" + num++); lock.notify(); try { lock.wait(); } catch (Exception e) {} } } }).start();\n        new Thread(() -> { while (num <= 100) { synchronized(lock) { if (num % 2 == 0) System.out.println("偶数:" + num++); lock.notify(); try { if (num <= 100) lock.wait(); } catch (Exception e) {} } } }).start();\n    }\n}',
      ].map((text, idx) => {
        if (text === '') return new Paragraph({ text: '', spacing: { after: 0 } });
        // Section headers
        if (text.startsWith('一、') || text.startsWith('二、') || text.startsWith('三、') || text.startsWith('四、') || text.startsWith('五、')) {
          return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } });
        }
        // Questions
        return new Paragraph({
          children: [
            new TextRun({ text, size: 22, font: '宋体' }),
          ],
          spacing: { after: 60 },
        });
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('/Users/you/My Projects/My Vue/Exam-DeepSeek/Java期末考试.docx', buffer);
console.log('✅ Word 文档已生成: Java期末考试.docx');
console.log('文件大小:', (buffer.length / 1024).toFixed(1), 'KB');
