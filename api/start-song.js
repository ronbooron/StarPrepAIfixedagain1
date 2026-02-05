// api/start-song.js — Kick off song generation via Kie.ai
// Uses process.env.KIE_API_KEY (set in Vercel dashboard)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KIE_API_KEY = process.env.KIE_API_KEY;
  if (!KIE_API_KEY) {
    return res.status(500).json({ error: 'KIE_API_KEY not configured in Vercel environment variables' });
  }

  try {
    const {
      prompt, lyrics, style = 'Pop', title = 'StarPrep Song',
      instrumental = false, vocalGender = 'f',
    } = req.body;

    if (!prompt && !lyrics) return res.status(400).json({ error: 'Prompt or lyrics required' });

    console.log('🎵 Starting Kie.ai generation...');
    console.log('   Lyrics:', (lyrics || prompt || '').substring(0, 80) + '...');

    const generateBody = {
      model: 'V5',
      customMode: true,
      instrumental,
      style,
      title,
      prompt: lyrics || prompt,
      callBackUrl: 'https://httpbin.org/post',
    };
    if (!instrumental && vocalGender) generateBody.vocalGender = vocalGender;

    const r = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(generateBody),
    });

    const result = await r.json();
    console.log('   Response code:', result.code, '| msg:', result.msg);

    if (!r.ok || result.code !== 200) {
      throw new Error(`Kie.ai: ${result.msg || JSON.stringify(result)}`);
    }

    const taskId = result.data?.taskId || result.taskId;
    if (!taskId) throw new Error('No task ID returned from Kie.ai');

    console.log('   ✅ Task started:', taskId);
    return res.status(200).json({ success: true, taskId, status: 'PROCESSING' });
  } catch (error) {
    console.error('❌ start-song error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
