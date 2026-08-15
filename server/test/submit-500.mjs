// 500 学生提交作业（解决 shell 转义问题）
const BASE = 'http://localhost:3000/api';

async function post(url, body, token) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}

const AID = 265, QID = 328, SUBQID = 749;

const REF = 'class S{String n;int s;S(String n,int s){this.n=n;this.s=s;}}class M{java.util.List<S>l=new java.util.ArrayList<>();void a(S s){l.add(s);}double v(){return l.stream().mapToInt(x->x.s).average().orElse(0);}int x(){return l.stream().mapToInt(x->x.s).max().orElse(0);}int m(){return l.stream().mapToInt(x->x.s).min().orElse(0);}void p(){l.sort((a,b)->b.s-a.s);l.forEach(x->System.out.println(x.n+":"+x.s));}}';
const PARTIAL = 'class T{public static void main(String[]a){int x=85,y=92;System.out.println((x+y)/2);}}';
const POOR = 'public class X{public static void main(String[]a){System.out.println("ok");}}';
const EMPTY = '';

const answers = [REF, PARTIAL, POOR, EMPTY, REF]; // 每组100人
let ok = 0, fail = 0;
const t0 = Date.now();

for (let i = 0; i < 500; i += 40) {
  const batch = [];
  for (let j = i; j < Math.min(i + 40, 500); j++) {
    const num = String(j + 1).padStart(4, '0');
    const sid = `s${num}`;
    const ans = answers[Math.floor(j / 100)];
    batch.push((async () => {
      try {
        const login = await post('/auth/login', { username: sid, password: sid });
        if (login.code !== 0) { fail++; return; }
        await post(`/student/assignments/${AID}/submit`, {
          questionId: QID, subQuestionId: SUBQID, answer: ans,
        }, login.data.token);
        ok++;
      } catch { fail++; }
    })());
  }
  await Promise.all(batch);
  process.stdout.write(`\r  ${Math.min(i + 40, 500)}/500 ok=${ok} fail=${fail} (${Math.round((Date.now()-t0)/1000)}s)`);
}
console.log(`\n完成! ok=${ok} fail=${fail} 耗时${Math.round((Date.now()-t0)/1000)}s`);
