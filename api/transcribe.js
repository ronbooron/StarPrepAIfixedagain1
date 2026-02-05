// api/transcribe.js — Transcribe audio with Replicate Whisper
// Uses process.env.REPLICATE_API_TOKEN (set in Vercel dashboard)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured in Vercel environment variables' });
  }

  try {
    const { audioUrl, audioBase64 } = req.body;
    if (!audioUrl && !audioBase64) return res.status(400).json({ error: 'audioUrl or audioBase64 required' });

    let audioInput = audioUrl;
    if (!audioUrl && audioBase64) audioInput = `data:audio/webm;base64,${audioBase64}`;

    console.log('🎧 Transcribing with Whisper...');
    console.log('   Input type:', audioInput?.startsWith('data:') ? 'data URL' : 'hosted URL');

    // Use incredibly-fast-whisper with sync mode
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        version: 'vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c',
        input: { audio: audioInput, task: 'transcribe', language: 'english', batch_size: 64 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Replicate error:', response.status, errText.slice(0, 200));
      throw new Error(`Replicate error: ${errText.slice(0, 200)}`);
    }

    const prediction = await response.json();

    // Sync mode may already have the result
    if (prediction.status === 'succeeded' && prediction.output) {
      const text = extractText(prediction.output);
      console.log('✅ Transcribed (sync):', text);
      return res.status(200).json({ success: true, text, words: text, transcription: text });
    }

    // Otherwise poll
    let text = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const sr = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });
      if (!sr.ok) continue;
      const s = await sr.json();
      if (s.status === 'succeeded') { text = extractText(s.output); break; }
      if (s.status === 'failed') throw new Error(s.error || 'Transcription failed');
    }

    if (!text) throw new Error('Transcription timed out');

    console.log('✅ Transcribed:', text);
    return res.status(200).json({ success: true, text, words: text, transcription: text });
  } catch (error) {
    console.error('❌ Transcribe error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

function extractText(output) {
  if (typeof output === 'string') return output.trim();
  if (output?.text) return output.text.trim();
  if (output?.transcription) return output.transcription.trim();
  if (Array.isArray(output)) return output.map(s => s.text || s).join(' ').trim();
  return String(output).trim();
}
