import mysql from 'mysql2/promise';

const DB = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'your_password',
  database: 'exam_system',
};

// ====== 答案模板 (已省略，完全同上) ======
// 实际模板从外部加载，避免主脚本太长

async function main() {
  const conn = await mysql.createConnection(DB);
  console.log('Connected to DB');

  const esc = (s) => conn.escape(s);

  // 获取作业2关联的班级学生
  const [rows] = await conn.query(`
    SELECT DISTINCT u.id, u.username FROM users u
    JOIN student_classes sc ON sc.student_id = u.id
    JOIN assignment_classes ac ON ac.class_id = sc.class_id
    WHERE ac.assignment_id = 2 AND u.role = 'student'
    ORDER BY u.id
  `);
  console.log(`Found ${rows.length} students`);

  // 删除作业2已有的提交
  await conn.query(`DELETE FROM submissions WHERE assignment_id = 2`);
  console.log('Cleared old submissions');

  // 答案模板
  const templates = getTemplates(esc);

  // 随机打乱学生，按1/5比例分配5个等级
  const shuffled = rows.sort(() => Math.random() - 0.5);
  const n = shuffled.length;
  const s = Math.floor(n / 5);
  const tierMap = {
    A: shuffled.slice(0, s),
    B: shuffled.slice(s, s * 2),
    C: shuffled.slice(s * 2, s * 3),
    D: shuffled.slice(s * 3, s * 4),
    E: shuffled.slice(s * 4),
  };
  console.log(`A(>=90):${tierMap.A.length} B(>=80):${tierMap.B.length} C(>=70):${tierMap.C.length} D(>=60):${tierMap.D.length} E(<60):${tierMap.E.length}`);

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const values = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  for (const [tier, students] of Object.entries(tierMap)) {
    for (const stu of students) {
      // 小题1
      values.push(`(2, ${stu.id}, 2, 1, ${esc(pick(templates.sq1['tier' + tier]))}, 'submitted', '${now}')`);
      // 小题2
      values.push(`(2, ${stu.id}, 2, 2, ${esc(pick(templates.sq2['tier' + tier]))}, 'submitted', '${now}')`);
      // 小题3 - Java
      values.push(`(2, ${stu.id}, 2, 3, ${esc(pick(templates.sq3['tier' + tier]))}, 'submitted', '${now}')`);
    }
  }

  // 分批插入
  for (let i = 0; i < values.length; i += 200) {
    const batch = values.slice(i, i + 200).join(',\n');
    await conn.query(`
      INSERT INTO submissions (assignment_id, student_id, question_id, sub_question_id, answer, status, submitted_at)
      VALUES ${batch}
    `);
    console.log(`Inserted ${Math.min(i + 200, values.length)} / ${values.length}`);
  }

  console.log(`Done! ${values.length} submissions inserted.`);
  await conn.end();
}

function getTemplates(esc) {
  return {
    sq1: {
      tierA: [
        `# 字符串反转程序\ns = input()\nrev = ''\ni = len(s) - 1\nwhile i >= 0:\n    rev += s[i]\n    i -= 1\nprint(rev)`,
        `# 获取输入并反转\ntext = input()\nresult = ''\nidx = len(text) - 1\nwhile idx >= 0:\n    result += text[idx]\n    idx -= 1\nprint(result)`,
        `s = str(input())\nrev = ''\ni = len(s) - 1\nwhile i >= 0:\n    rev += s[i]\n    i -= 1\nprint(rev)`,
      ],
      tierB: [
        `s = input()\nrev = ''\nfor ch in s:\n    rev = ch + rev\nprint(rev)`,
        `s = input()\nrev = ''\ni = 0\nwhile i < len(s):\n    rev = s[i] + rev\n    i += 1\nprint(rev)`,
        `# 使用切片反转\ns = input()\nprint(s[::-1])`,
      ],
      tierC: [
        `s = input()\nrev = ''\ni = len(s) - 1\nwhile i >= 1:\n    rev += s[i]\n    i -= 1\nprint(rev)`,
        `s = input()\nrev = ''\nfor i in range(len(s)-1, -1, -1):\n    rev += s[i]\nprint(rev)`,
      ],
      tierD: [
        `s = input()\nrev = ''\ni = len(s)\nwhile i > 0:\n    rev += s[i]\n    i -= 1\nprint(rev)`,
        `s = input()\nrev = ''\nfor ch in s:\n    rev = rev + ch\nprint(rev)`,
      ],
      tierE: [
        `s = input()\nprint(s.reverse())`,
        `s = input()\nprint(s)`,
        `print(input()[::-1])`,
      ],
    },
    sq2: {
      tierA: [
        `numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nodd_numbers = []\nfor num in numbers:\n    if num % 2 == 1:\n        odd_numbers.append(num)\nprint(f"原始列表：{numbers}")\nprint(f"奇数列表：{odd_numbers}")\nprint(f"奇数个数：{len(odd_numbers)}")`,
        `nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nodds = []\nfor n in nums:\n    if n % 2 != 0:\n        odds.append(n)\nprint("原始列表：", nums)\nprint("奇数列表：", odds)`,
      ],
      tierB: [
        `numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nodd_numbers = []\nfor num in numbers:\n    if num % 2 == 1:\n        odd_numbers.append(num)\nprint(f"原始列表：{numbers}")\nprint(f"奇数列表：{odd_numbers}")`,
        `nums = list(range(1, 11))\nodds = []\nfor n in nums:\n    if n % 2:\n        odds.append(n)\nprint(f"原列表: {nums}, 奇数: {odds}")`,
      ],
      tierC: [
        `numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nodd = []\nfor i in numbers:\n    if i % 2 == 0:\n        continue\n    odd.append(i)\nprint(numbers)\nprint(odd)`,
        `list1 = [1,2,3,4,5,6,7,8,9,10]\nlist2 = []\nfor x in list1:\n    if x // 2 * 2 != x:\n        list2.append(x)\nprint(list1)\nprint(list2)`,
      ],
      tierD: [
        `numbers = [1,2,3,4,5,6,7,8,9,10]\nodd = []\nfor i in range(10):\n    if numbers[i] % 2 == 1:\n        odd.append(i)\nprint(numbers)\nprint(odd)`,
        `nums = [1,2,3,4,5,6,7,8,9,10]\nfor n in nums:\n    if n % 2 == 1:\n        print(n)`,
      ],
      tierE: [
        `numbers = [1,2,3,4,5,6,7,8,9,10]\nodd = filter(lambda x: x%2==1, numbers)\nprint(list(odd))`,
        `print("奇数: 1,3,5,7,9")`,
        `numbers = [1,2,3,4,5,6,7,8,9,10]\nfor i in range(len(numbers)):\n    if i % 2 == 1:\n        print(numbers[i])`,
      ],
    },
    sq3: {
      tierA: [
        `public class Main {\n    static class Person {\n        String name;\n        int age;\n        String gender;\n        public Person(String name, int age, String gender) {\n            this.name = name; this.age = age; this.gender = gender;\n        }\n        public Person() {}\n        public void sleep() {\n            System.out.println("我现在开始睡觉了");\n        }\n        public void sleep(int time) {\n            System.out.println("我已经睡觉" + time + "小时了");\n        }\n    }\n    public static class Student extends Person {\n        String school;\n        int no;\n        String major;\n        public Student(String name, int age, String gender, String school, int no, String major) {\n            super(name, age, gender);\n            this.school = school; this.no = no; this.major = major;\n        }\n        public Student() {}\n        public void sayHello() {\n            System.out.println("大家好，我叫" + this.name);\n            System.out.println("我是" + this.gender + "生，今年" + this.age + "岁");\n            System.out.println("我来自" + this.school + this.major + "专业");\n        }\n    }\n    public static void main(String[] args) {\n        Student s = new Student("张三", 20, "男", "广西经贸职业技术学院", 1001, "计算机应用技术");\n        s.sleep();\n        s.sleep(8);\n        s.sayHello();\n    }\n}`,
      ],
      tierB: [
        `public class Main {\n    static class Person {\n        String name; int age; String gender;\n        public Person(String name, int age, String gender) {\n            this.name = name; this.age = age; this.gender = gender;\n        }\n        public Person() {}\n        public void sleep() { System.out.println("开始睡觉"); }\n        public void sleep(int n) { System.out.println("睡了" + n + "小时"); }\n    }\n    static class Student extends Person {\n        String school; int no; String major;\n        public Student(String name, int age, String gender, String school, int no, String major) {\n            super(name, age, gender);\n            this.school = school; this.no = no; this.major = major;\n        }\n        public Student() {}\n        public void sayHello() {\n            System.out.println("大家好，我叫" + name);\n            System.out.println("我今年" + age + "岁");\n        }\n    }\n    public static void main(String[] args) {\n        Student stu = new Student("李四", 19, "女", "广西经贸职业技术学院", 1002, "软件技术");\n        stu.sleep();\n        stu.sleep(6);\n        stu.sayHello();\n    }\n}`,
      ],
      tierC: [
        `public class Main {\n    static class Person {\n        String name; int age; String gender;\n        public Person(String n, int a, String g) { name = n; age = a; gender = g; }\n        public Person() {}\n        public void sleep() { System.out.println("睡觉"); }\n        public void sleep(int time) { System.out.println("睡了" + time + "小时"); }\n    }\n    static class Student extends Person {\n        String school; int no; String major;\n        public Student(String name, int age, String gender, String school, int no, String major) {\n            this.name = name; this.age = age; this.gender = gender;\n            this.school = school; this.no = no; this.major = major;\n        }\n        public void sayHello() { System.out.println("hello, I am " + name); }\n    }\n    public static void main(String[] args) {\n        Student s = new Student("王五", 21, "男", "广西经贸", 1003, "网络技术");\n        s.sleep();\n        s.sleep(7);\n        s.sayHello();\n    }\n}`,
      ],
      tierD: [
        `public class Main {\n    static class Person {\n        String name; int age;\n        public Person(String name, int age) { this.name = name; this.age = age; }\n        public void sleep() { System.out.println("sleeping"); }\n    }\n    static class Student extends Person {\n        String school; int no;\n        public Student(String name, int age, String school, int no) {\n            super(name, age); this.school = school; this.no = no;\n        }\n        public void sayHello() { System.out.println("hi, " + name); }\n    }\n    public static void main(String[] args) {\n        Student s = new Student("赵六", 22, "广西经贸", 1004);\n        s.sleep();\n        s.sayHello();\n    }\n}`,
      ],
      tierE: [
        `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}`,
        `public class Main {\n    static class Person { String name; Person(String n) { name = n; } }\n    static class Student { String school; Student(String s) { school = s; } }\n    public static void main(String[] args) {\n        Person p = new Person("测试");\n        Student s = new Student("广西经贸");\n        System.out.println("done");\n    }\n}`,
        `public class Main {\n    public static void main(String[] args) {\n        String name = "学生";\n        int age = 20;\n        System.out.println(name + " " + age);\n        System.out.println("睡觉中...");\n    }\n}`,
      ],
    },
  };
}

main().catch(e => { console.error(e); process.exit(1); });
