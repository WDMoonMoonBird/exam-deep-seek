const key = 'sk-***REDACTED***';

async function probe(model, maxTokens) {
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请只回复一个整数评分，格式为 Score: [X]，X 是 1 到 5 的整数。' }],
        max_tokens: maxTokens,
        temperature: 1.0,
        logprobs: true,
        top_logprobs: 5,
      }),
    });
    const data = await res.json();
    if (!res.ok) { console.log(model, 'API_ERR', res.status, JSON.stringify(data).slice(0, 200)); return; }
    const ch = data.choices?.[0];
    const lp = ch?.logprobs;
    console.log('=== model=' + model + ' max_tokens=' + maxTokens + ' ===');
    console.log('finish:', ch?.finish_reason, '| msg content:', JSON.stringify(ch?.message?.content));
    console.log('logprobs keys:', lp ? Object.keys(lp) : 'none');
    const content = lp?.content;
    if (content && content.length > 0) {
      console.log('content logprobs len:', content.length);
      const t = content[content.length - 1]; // last token often the score
      console.log('last tok:', JSON.stringify(t?.token), 'logprob:', t?.logprob);
      console.log('top:', JSON.stringify((t?.top_logprobs || []).slice(0, 3).map(x => x.token + ':' + x.logprob.toFixed(2))));
    } else {
      const rc = lp?.reasoning_content;
      console.log('reasoning len:', rc ? rc.length : 0);
    }
  } catch (e) { console.log(model, 'FETCH_ERR:', e.message.slice(0, 200)); }
}

await probe('deepseek-v4-flash', 2000);
await probe('deepseek-chat', 500);
