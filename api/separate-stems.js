// api/separate-stems.js — Separate vocals from instrumentals using Replicate
// Uses process.env.REPLICATE_API_TOKEN

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured' });
  }

  try {
    const { audioUrl } = req.body;
    if (!audioUrl) return res.status(400).json({ error: 'audioUrl required' });

    console.log('🎵 Separating stems...');

    const r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=120',
      },
      body: JSON.stringify({
        version: 'cjwbw/demucs:25a173108cff36ef9f80f854c162d01df9e6528be175794b81571db50571f6ce',
        input: { audio: audioUrl, stems: 'vocals' },
      }),
    });

    if (!r.ok) throw new Error(`Replicate error: ${await r.text()}`);

    let pred = await r.json();

    // Poll if not done yet
    if (pred.status !== 'succeeded' && pred.id) {
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const sr = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
          headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        });
        pred = await sr.json();
        if (pred.status === 'succeeded') break;
        if (pred.status === 'failed') throw new Error(pred.error || 'Stem separation failed');
      }
    }

    if (pred.status !== 'succeeded' || !pred.output) throw new Error('Stem separation timed out');

    console.log('✅ Stems separated!');
    return res.status(200).json({
      success: true,
      vocalsUrl: pred.output.vocals || pred.output[0],
      instrumentalUrl: pred.output.no_vocals || pred.output.other || pred.output[1] || audioUrl,
    });
  } catch (error) {
    console.error('❌ Stems error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
