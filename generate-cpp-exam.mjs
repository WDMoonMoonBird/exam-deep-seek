// 生成 C++ 考试试卷 Word 文档（主观题无参考答案）
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import fs from 'fs';

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({ text: 'C++ 程序设计期末考试', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '满分：100 分 | 考试时间：120 分钟', alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
      new Paragraph({ text: '注意事项：请将答案写在答题卡上，编程题写出完整代码。', spacing: { after: 400 } }),

      ...['一、单选题（每题 2 分，共 10 题）',
        '1. C++ 中 cin 和 cout 所属的头文件是？',
        'A. <cstdio>', 'B. <iostream>', 'C. <fstream>', 'D. <cstdlib>', '答案：B',
        '2. 以下哪个运算符不能用于动态分配内存？',
        'A. new', 'B. delete', 'C. malloc', 'D. sizeof', '答案：D',
        '3. C++ 中引用（reference）声明使用的符号是？',
        'A. *', 'B. &', 'C. #', 'D. @', '答案：B',
        '4. 以下哪个不是 C++ 的访问修饰符？',
        'A. public', 'B. private', 'C. protected', 'D. internal', '答案：D',
        '5. vector 容器位于哪个命名空间？',
        'A. std', 'B. stl', 'C. cpp', 'D. boost', '答案：A',
        '6. RAII 全称是什么？',
        'A. Resource Acquisition Is Initialization', 'B. Runtime Allocation Is Immediate',
        'C. Random Access Is Included', 'D. Resource Allocation In Interface', '答案：A',
        '7. 以下代码输出是什么？\n  int x = 5;\n  cout << x++ << endl;',
        'A. 4', 'B. 5', 'C. 6', 'D. 编译错误', '答案：B',
        '8. 纯虚函数的声明方式是？',
        'A. virtual void func() = 0;', 'B. void virtual func() = 0;',
        'C. virtual void func() null;', 'D. pure void func();', '答案：A',
        '9. 以下哪个不是 C++ STL 中的顺序容器？',
        'A. vector', 'B. list', 'C. deque', 'D. set', '答案：D',
        '10. 智能指针 unique_ptr 的特点是？',
        'A. 可共享所有权', 'B. 独占所有权不可拷贝', 'C. 无引用计数', 'D. 只能指向数组', '答案：B',

        '', '二、多选题（每题 3 分，共 10 题）',
        '11. 以下哪些是 C++11 引入的特性？',
        'A. auto 关键字', 'B. lambda 表达式', 'C. 智能指针', 'D. 范围 for 循环', '答案：A,B,C,D',
        '12. 以下哪些容器属于关联容器？',
        'A. map', 'B. set', 'C. vector', 'D. unordered_map', '答案：A,B,D',
        '13. 关于构造函数，以下说法正确的有？',
        'A. 可以有多个重载', 'B. 可以有返回值', 'C. 可以带默认参数', 'D. 析构函数不能重载', '答案：A,C,D',
        '14. 以下哪些操作会导致迭代器失效？',
        'A. vector 尾部插入元素', 'B. vector 中部删除元素', 'C. list 删除元素', 'D. map 插入元素', '答案：A,B',
        '15. C++ 中以下哪些属于多态的实现方式？',
        'A. 函数重载', 'B. 运算符重载', 'C. 虚函数', 'D. 模板', '答案：A,B,C,D',
        '16. 关于移动语义，正确的有？',
        'A. 使用 && 声明右值引用', 'B. std::move 可以触发移动构造',
        'C. 移动后原对象仍可使用', 'D. 可避免不必要的深拷贝', '答案：A,B,D',
        '17. 以下哪些关键字用于异常处理？',
        'A. try', 'B. catch', 'C. throw', 'D. finally', '答案：A,B,C',
        '18. 关于 const 关键字，正确的有？',
        'A. const 成员函数不能修改成员变量', 'B. const 对象只能调用 const 成员函数',
        'C. 顶层 const 和底层 const 含义相同', 'D. 可以用 mutable 突破 const 限制', '答案：A,B,D',
        '19. 以下哪些是类型转换运算符？',
        'A. static_cast', 'B. dynamic_cast', 'C. const_cast', 'D. reinterpret_cast', '答案：A,B,C,D',
        '20. 关于模板，正确的有？',
        'A. 支持函数模板', 'B. 支持类模板', 'C. 支持模板特化', 'D. 模板参数可以是整数', '答案：A,B,C,D',

        '', '三、判断题（每题 1 分，共 10 题）',
        '21. C++ 支持多重继承。', '正确',
        '22. 内联函数一定会在调用处展开。', '错误',
        '23. 空类的 sizeof 结果为 0。', '错误',
        '24. 友元函数可以访问类的私有成员。', '正确',
        '25. 析构函数可以被重载。', '错误',
        '26. STL 中的 sort 算法使用快速排序。', '正确',
        '27. C++ 中数组名就是指针常量。', '错误',
        '28. 虚函数表在编译时确定。', '错误',
        '29. 静态成员变量必须在类外定义。', '正确',
        '30. unique_ptr 可以通过赋值来共享所有权。', '错误',

        '', '四、填空题（每题 2 分，共 10 题）',
        '31. C++ 中标准输入流对象是 ______。', '答案：cin',
        '32. 动态分配一个 int 类型变量的语句是 int* p = ______ int;。', '答案：new',
        '33. 获取 string 长度的成员函数是 ______。', '答案：size',
        '34. 虚函数使用关键字 ______ 声明。', '答案：virtual',
        '35. 模板声明使用关键字 ______。', '答案：template',
        '36. vector 尾部添加元素使用的成员函数是 ______。', '答案：push_back',
        '37. 命名空间定义使用关键字 ______。', '答案：namespace',
        '38. 释放动态分配内存使用的关键字是 ______。', '答案：delete',
        '39. C++ STL 中哈希映射容器的名称是 ______。', '答案：unordered_map',
        '40. 用于捕获所有异常的语法是 catch(______ e)。', '答案：...',

        '', '五、编程题（共 5 题）',
        '41. 编写一个函数模板，接收任意类型的 vector，返回其中的最大值。要求使用迭代器实现。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '42. 编写一个类 Matrix，表示 2x2 矩阵，提供构造函数、加法重载 operator+ 和打印方法，并使用 RAII 管理动态内存。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '43. 编写一个简单的字符串类 MyString，包含构造、析构、拷贝构造、赋值运算符重载，并实现 size() 和 c_str() 方法。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '44. 编写一个程序，读取一个文本文件的内容，统计其中每个单词出现的次数，并输出频率最高的 10 个单词。使用 STL 容器实现。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
        '45. 编写一个多线程程序，使用 C++ 线程库，一个线程生成随机数存入队列，另一个线程从队列取出并计算平方和。使用 mutex 保护共享数据。（10 分）\n评分标准：正确性60% + 效率20% + 可读性20%',
      ].map((text, idx) => {
        if (text === '') return new Paragraph({ text: '', spacing: { after: 0 } });
        if (text.startsWith('一、') || text.startsWith('二、') || text.startsWith('三、') || text.startsWith('四、') || text.startsWith('五、')) {
          return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } });
        }
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
const outPath = '/Users/you/My Projects/My Vue/Exam-DeepSeek/C++期末考试.docx';
fs.writeFileSync(outPath, buffer);
console.log('✅ Word 文档已生成: C++期末考试.docx');
console.log('文件大小:', (buffer.length / 1024).toFixed(1), 'KB');
