const key = 'sk-***REDACTED***';
try {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: '请只回复一个整数评分，格式为 Score: [X]，X 是 1 到 5 的整数。' }],
      max_tokens: 100,
      temperature: 1.0,
      logprobs: true,
      top_logprobs: 5,
    }),
  });
  const data = await res.json();
  const ch = data.choices?.[0];
  const content = ch?.logprobs?.content;
  console.log('finish:', ch?.finish_reason);
  console.log('message content:', JSON.stringify(ch?.message?.content));
  console.log('logprobs content length:', content ? content.length : 'null');
  if (content && content.length > 0) {
    for (let i = 0; i < Math.min(6, content.length); i++) {
      const t = content[i];
      console.log('tok[' + i + ']:', JSON.stringify({
        token: t.token,
        logprob: t.logprob,
        top: (t.top_logprobs || []).map(x => ({ token: x.token, logprob: x.logprob })).slice(0, 5)
      }).slice(0, 400));
    }
  }
  // full keys of response
  console.log('choice keys:', Object.keys(ch || {}));
  console.log('logprobs keys:', ch?.logprobs ? Object.keys(ch.logprobs) : 'none');
} catch (e) { console.log('FETCH_ERR:', e.message.slice(0, 300)); }
