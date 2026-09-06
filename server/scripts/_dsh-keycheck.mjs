const key = 'sk-***REDACTED***';
try {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: '只输出数字 42' }],
      max_tokens: 10,
      temperature: 1.0,
      logprobs: true,
      top_logprobs: 5,
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.log('API_ERR', res.status, JSON.stringify(data).slice(0, 300)); process.exit(0); }
  const ch = data.choices?.[0];
  console.log('MODEL_OK:', data.model);
  console.log('HAS_LOGPROBS:', !!ch?.logprobs);
  if (ch?.logprobs?.content) {
    const first = ch.logprobs.content[0];
    console.log('TOKEN_SAMPLE:', JSON.stringify(first).slice(0, 500));
  }
  console.log('CONTENT:', JSON.stringify(ch?.message?.content));
} catch (e) { console.log('FETCH_ERR:', e.message.slice(0, 300)); }
