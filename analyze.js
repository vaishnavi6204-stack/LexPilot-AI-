const DAILY_LIMIT = 15;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'No contract text provided' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const ok = await checkLimit(ip);
  if (!ok) {
    return res.status(429).json({ error: 'Daily limit reached. Try again tomorrow.' });
  }

  const prompt = `You are LexPilot AI, an expert legal due diligence system for Indian startup law.
Analyze the contract below and return ONLY valid JSON — no markdown, no code fences, no extra text.

JSON structure:
{
  "score": <integer 0-100>,
  "confidence": "<e.g. 91%>",
  "verdict": "<5-7 word verdict>",
  "summary": "<2 sentence plain English summary>",
  "clauses": [
    {"name":"<clause name>","risk":"HIGH"|"MEDIUM"|"STANDARD","issue":"<specific issue or why compliant>","law":"<specific Indian statute e.g. Indian Contract Act 1872 §73>"}
  ],
  "recommendations": ["<actionable step>"]
}

Rules: score 0-100, identify 6-12 clauses, cite real Indian laws, 3-6 recommendations. Return ONLY JSON.

CONTRACT:
${text.slice(0, 6000)}`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await claudeRes.json();
    if (data.error) throw new Error(data.error.message);

    const raw = data.content.map(b => b.text || '').join('');
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}

async function checkLimit(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('rate limiting disabled - upstash not configured');
    return true;
  }

  const key = `lexpilot:${ip}:${new Date().toISOString().slice(0, 10)}`;
  const incr = await fetch(`${url}/incr/${key}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const { result: count } = await incr.json();

  if (count === 1) {
    await fetch(`${url}/expire/${key}/86400`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  return count <= DAILY_LIMIT;
}