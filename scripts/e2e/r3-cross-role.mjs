// ★R3-C7（t21）：基址可用 E2E_BASE 覆盖（默认本地栈 :3000）——便于指向 DATABASE_URL=exam_system_test 的独立 stack
// ★R3-E1（t24）：接入共用守卫（非 localhost 默认拒绝 / 打印将写入库 / 非本地开发库需 --i-know）
import { guard } from './_guard.mjs';
const B = (process.env.E2E_BASE || "http://localhost:3000") + "/api";
guard({ base: B });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (o) => JSON.stringify(o);
let pass = 0, fail = 0, skip = 0; const steps = [];
const ok = (n, c, d) => { (c ? pass++ : fail++); steps.push((c ? "PASS " : "FAIL ") + n + (d ? "  <- " + d : "")); };
const api = async (m, p, t, body) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ "Content-Type": "application/json" }, t ? { Authorization: "Bearer " + t } : {}), body: body ? J(body) : undefined }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, j, txt }; };
const login = async (u) => { const r = await api("POST", "/auth/login", null, { username: u, password: "Test@12345" }); return r.j && r.j.data && r.j.data.token; };
(async () => {
  const ts = Date.now().toString().slice(-6);
  const tt = await login("test_teacher"); ok("教师登录", !!tt);
  const st = await login("test_stu_01@10001"); ok("学生登录(班级123)", !!st);
  const now = Date.now();
  const create = await api("POST", "/teacher/assignments", tt, { title: "E2E-贯通-" + ts, description: "跨角色端到端(可删)", startTime: new Date(now - 3600e3).toISOString(), endTime: new Date(now + 86400e3).toISOString(), questionIds: [+(process.env.E2E_QUESTION_ID || 326)], classIds: [+(process.env.E2E_CLASS_ID || 123)], allowResubmit: true, maxAttempts: 2, scorePolicy: "best", answerVisibility: "after_publish", confirmWithoutStandardPackage: true });
  const aid = create.j && create.j.data && create.j.data.id;
  ok("① 教师建作业(三开关落库)", create.status === 200 && !!aid, "id=" + aid);
  const det = await api("GET", "/teacher/assignments/" + aid, tt); const sw = (det.j && det.j.data) || {};
  ok("② 教师端回显三开关", sw.allowResubmit === true && sw.maxAttempts === 2 && sw.scorePolicy === "best" && sw.answerVisibility === "after_publish");
  const sDet = await api("GET", "/student/assignments/" + aid, st); const asg = (sDet.j && sDet.j.data && sDet.j.data.assignment) || {};
  const aq = asg.assignmentQuestions || [];
  steps.push("    assignmentQuestions[0] = " + J(aq[0]));
  const qid = (aq[0] && (aq[0].questionId || (aq[0].question && aq[0].question.id) || aq[0].id)) || 326;
  const sq = aq[0] && (aq[0].subQuestions || (aq[0].question && aq[0].question.subQuestions));
  const sqid = (sq && sq[0] && sq[0].id) || (aq[0] && aq[0].subQuestionId) || undefined;
  ok("③ 解析出 questionId/subQuestionId", !!qid, "qid=" + qid + " sqid=" + sqid);
  const mk = (ans) => { const b = { questionId: qid, answer: ans }; if (sqid) b.subQuestionId = sqid; return b; };
  const sub1 = await api("POST", "/student/assignments/" + aid + "/submit", st, mk("public class A { }"));
  ok("④ 学生第1次提交", sub1.status === 200 && sub1.j && sub1.j.code === 0, "status=" + sub1.status + " " + String(sub1.txt).slice(0, 110));
  const sub2 = await api("POST", "/student/assignments/" + aid + "/submit", st, mk("public class A { public static void main(String[] a){} }"));
  ok("⑤ 学生第2次提交(允许重交)", sub2.status === 200 && sub2.j && sub2.j.code === 0, "status=" + sub2.status + " " + String(sub2.txt).slice(0, 110));
  const sub3 = await api("POST", "/student/assignments/" + aid + "/submit", st, mk("public class A { }"));
  ok("⑥ 第3次被上限拦截", String(sub3.txt).includes("次数上限"), "status=" + sub3.status + " " + String(sub3.txt).slice(0, 110));
  // ★R3-C7（t21）修正：/teacher/submissions 的列表行没有顶层 assignmentId（真实字段是嵌套 assignment.id），
  //   且服务端目前**忽略** assignmentId 查询参数（O-E2E-1，另任务修）⇒ 这里用 pageSize=100 + 客户端按嵌套字段过滤。
  const rl = await api("GET", "/teacher/submissions?pageSize=100", tt);
  const all = (rl.j && rl.j.data && (rl.j.data.list || rl.j.data)) || [];
  const cand = (Array.isArray(all) ? all : []).filter((x) => String(x.assignment && x.assignment.id) === String(aid));
  const sid = cand.length ? cand[0].id : null;
  ok("⑦ 教师看到该作业提交", !!sid, "匹配 " + cand.length + " / 全量 " + (Array.isArray(all) ? all.length : 0) + " total=" + ((rl.j && rl.j.data && rl.j.data.total) || "?"));
  if (sid) {
    // ★R3-C7（t21）补 grade 段：教师触发作业批改（W7 幂等端点）→ 轮询至评分完成
    const grade = await api("POST", "/teacher/assignments/" + aid + "/grade", tt);
    const gOk = grade.status === 200 && !!(grade.j && grade.j.code === 0);
    const needChecker = grade.status === 409 && !!(grade.j && grade.j.data && grade.j.data.requiresChecker);
    if (needChecker) {
      skip++;
      steps.push("SKIP ⑦.1 教师触发作业批改：该题无可用 checker（409/1011 requiresChecker=true）⇒ 评分段需 checkerStatus=ready 的题目（见 E2E 计划）");
      skip++;
      steps.push("SKIP ⑦.2 轮询至评分完成：上一步未入队，本链路跳过（题目无 checker，非接口缺陷）");
    } else {
    ok("⑦.1 教师触发作业批改(grade) 200", gOk, "status=" + grade.status + " " + String(grade.txt).slice(0, 120));
    const statusOf = async () => {
      const r = await api("GET", "/teacher/submissions?pageSize=100", tt);
      const l = (r.j && r.j.data && r.j.data.list) || [];
      const row = l.find((x) => String(x.id) === String(sid));
      return row ? row.status : "?";
    };
    let gStatus = "", tries = 0;
    for (; tries < 40; tries++) {
      await sleep(1500);
      gStatus = await statusOf();
      if (["ai_graded", "reviewed", "published", "grading_failed"].includes(gStatus)) break;
    }
    ok("⑦.2 轮询至评分完成（ai_graded/reviewed/published）", ["ai_graded", "reviewed", "published"].includes(gStatus), "最终 status=" + gStatus + " 轮询=" + tries + " 次");
    }

    const sc = await api("PUT", "/teacher/submissions/" + sid + "/score", tt, { finalScore: 88, teacherFeedback: "E2E 改分" });
    ok("⑧ 教师改总分=88", sc.status === 200 && sc.j && sc.j.code === 0, "status=" + sc.status + " " + String(sc.txt).slice(0, 80));
    const bad = await api("PUT", "/teacher/submissions/" + sid + "/score", tt, { finalScore: -5 });
    ok("⑨ 非法分值 400+文案", bad.status === 400 && String(bad.txt).includes("分数不合法"), "status=" + bad.status);
    // ★R3-C7：正确发布端点是 PUT /teacher/submissions/publish {submissionIds}（只发布 status=reviewed 的行）；
    //   原写法 PUT /:id/review {status:'published'} 不会发布（实测发布后仍 reviewed ⇒ 学生看不到）
    const rv = await api("PUT", "/teacher/submissions/publish", tt, { submissionIds: [sid] });
    ok("⑩ 教师发布", rv.status === 200 && rv.j && rv.j.code === 0, "status=" + rv.status + " " + String(rv.txt).slice(0, 80));
    const after = await api("GET", "/student/assignments/" + aid, st);
    ok("⑪ 学生端发布后看到 88", /88/.test(String(after.txt || "")));
  }
  console.log(steps.join("\n"));
  console.log("\n===== PASS=" + pass + " FAIL=" + fail + " SKIP=" + skip + " ｜ 作业 id=" + aid + " =====");
  if (fail > 0) process.exitCode = 1;
})().catch((e) => { console.log("异常: " + (e && e.message)); console.log(steps.join("\n")); });