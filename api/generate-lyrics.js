// api/generate-lyrics.js — Generate song lyrics from 4 words
// Uses process.env.KIE_API_KEY (set in Vercel dashboard)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { words, style = 'Pop' } = req.body;
    if (!words) return res.status(400).json({ error: 'Words required' });

    console.log('📝 Lyrics from:', words, '| Style:', style);

    const KIE_API_KEY = process.env.KIE_API_KEY;

    // Try Kie.ai lyrics API first
    if (KIE_API_KEY) {
      try {
        const result = await generateWithKie(words, style, KIE_API_KEY);
        if (result) return res.status(200).json(result);
      } catch (e) { console.log('⚠️ Kie lyrics failed:', e.message); }
    }

    // Creative fallback
    const { title, lyrics } = generateCreativeLyrics(words, style);
    console.log('✅ Fallback lyrics generated:', title);
    return res.status(200).json({ success: true, lyrics, title });
  } catch (error) {
    console.error('❌ Lyrics error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

async function generateWithKie(words, style, apiKey) {
  const prompt = `Write an original ${style} song inspired by these words: "${words}".
Create a complete song with:
- A catchy, memorable title
- Verse 1 that tells a story
- An emotional, sing-along chorus
- Verse 2 that builds on the theme
- A bridge that adds depth
- Final chorus with a twist
The words "${words}" should inspire the theme but don't just repeat them. Be creative and emotional.`;

  const r = await fetch('https://api.kie.ai/api/v1/lyrics', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, callBackUrl: 'https://httpbin.org/post' }),
  });
  const result = await r.json();
  if (!r.ok || result.code !== 200) throw new Error(result.msg || 'Kie lyrics error');

  const taskId = result.data?.taskId;
  if (!taskId) return null;

  // Poll for lyrics
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const sr = await fetch(`https://api.kie.ai/api/v1/lyrics/record-info?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const s = await sr.json();
    if (s.code === 200 && s.data) {
      const st = s.data.status;
      if (st === 'SUCCESS' || st === 'TEXT_SUCCESS') {
        const lyrics = s.data.response?.text || s.data.response?.lyrics || s.data.text || s.data.lyrics;
        const title = s.data.response?.title || s.data.title || generateTitle(words);
        if (lyrics) { console.log('✅ Kie lyrics!'); return { success: true, lyrics, title }; }
      }
    }
  }
  return null;
}

// ── Fallback lyrics generator ──

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }

function generateTitle(words) {
  const wl = words.toLowerCase().split(' ').filter(w => w.length > 2);
  const templates = [
    () => `${cap(wl[0] || 'My')} ${cap(wl[1] || 'Heart')}`,
    () => `The ${cap(wl[0] || 'Dream')} Inside`,
    () => `Chasing ${cap(wl[0] || 'Stars')}`,
    () => `${cap(wl[0] || 'Love')} On Fire`,
    () => `${cap(wl[wl.length - 1] || 'Tonight')} Forever`,
  ];
  return templates[Math.floor(Math.random() * templates.length)]();
}

function generateCreativeLyrics(userWords, style) {
  const words = userWords.toLowerCase();
  const wl = words.split(' ').filter(w => w.length > 0);
  const main = wl[0] || 'dream';
  const second = wl[1] || 'tonight';
  const orig = userWords;
  const title = generateTitle(userWords);

  const lyrics = `[Verse 1]
Woke up this morning with you on my mind
Every moment with you, one of a kind
${cap(main)} keeps calling me back to you
Nothing else in this world I'd rather do

[Pre-Chorus]
Can't stop this feeling, it's taking over me
You're everything I've ever wanted to be

[Chorus]
${cap(orig)}, yeah that's what I feel
This love we got, you know it's real
${cap(orig)}, screaming out loud
Making me proud, stand out from the crowd
Oh-oh-oh, ${main}
Oh-oh-oh, tonight

[Verse 2]
Stars are shining brighter when you're around
My feet are floating right off the ground
${cap(second)} was waiting for someone like you
Now all my wildest dreams are coming true

[Pre-Chorus]
Can't stop this feeling, it's taking over me
You're everything I've ever wanted to be

[Chorus]
${cap(orig)}, yeah that's what I feel
This love we got, you know it's real
${cap(orig)}, screaming out loud
Making me proud, stand out from the crowd

[Bridge]
Take my hand, let's fly away
Into the night, into the day
Nothing can stop us, we're on our way
${cap(main)} is here to stay

[Final Chorus]
${cap(orig)}, yeah that's what I feel
This love we got, you know it's real
${cap(orig)}, we're taking it higher
Setting the world on fire
${cap(orig)}... forever mine`;

  return { title, lyrics };
}
