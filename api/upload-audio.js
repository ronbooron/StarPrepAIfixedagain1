// api/upload-audio.js — Upload audio → return a publicly accessible URL
// Keys come from Vercel environment variables

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) {} }
    if (!body || Object.keys(body).length === 0) return res.status(400).json({ error: 'Empty request body' });

    const { audioBase64, audio, contentType, type, fileName, forceHosted } = body;
    const base64Data = audioBase64 || audio;
    if (!base64Data) return res.status(400).json({ error: 'No audio data received' });

    const mimeType = contentType || type || 'audio/webm';
    const name = fileName || `audio-${Date.now()}.webm`;
    const fileSizeKB = Math.round(base64Data.length * 0.75 / 1024);
    const buffer = Buffer.from(base64Data, 'base64');

    console.log(`📤 Upload: ${name} | ${fileSizeKB} KB | ${mimeType}`);

    // ── 1. Uploadcare (PUBLIC URLs — required for Seed-VC voice cloning) ──
    const UC_KEY = process.env.UPLOADCARE_PUBLIC_KEY;
    if (UC_KEY) {
      try {
        const fd = new FormData();
        fd.append('UPLOADCARE_PUB_KEY', UC_KEY);
        fd.append('UPLOADCARE_STORE', '1');
        fd.append('file', new Blob([buffer], { type: mimeType }), name);
        const r = await fetch('https://upload.uploadcare.com/base/', { method: 'POST', body: fd });
        if (r.ok) {
          const { file: fileId } = await r.json();
          if (fileId) {
            const url = `https://ucarecdn.com/${fileId}/`;
            console.log('✅ Uploadcare:', url);
            return res.status(200).json({ success: true, url, hosted: true, service: 'uploadcare' });
          }
        } else { console.warn('⚠️ Uploadcare:', (await r.text()).slice(0, 120)); }
      } catch (e) { console.warn('⚠️ Uploadcare error:', e.message); }
    }

    // ── 2. Replicate Files API (authenticated URLs) ──
    const REP = process.env.REPLICATE_API_TOKEN;
    if (REP && fileSizeKB < 4000) {
      try {
        const fd = new FormData();
        fd.append('content', new Blob([buffer], { type: mimeType }), name);
        const r = await fetch('https://api.replicate.com/v1/files', {
          method: 'POST', headers: { Authorization: `Bearer ${REP}` }, body: fd,
        });
        if (r.ok) {
          const data = await r.json();
          const url = data.urls?.get || data.url;
          if (url) {
            console.log('✅ Replicate:', url);
            return res.status(200).json({ success: true, url, hosted: true, service: 'replicate' });
          }
        } else { console.warn('⚠️ Replicate upload:', (await r.text()).slice(0, 120)); }
      } catch (e) { console.warn('⚠️ Replicate error:', e.message); }
    }

    // ── 3. Data-URL fallback (works for transcription, NOT for Seed-VC) ──
    if (fileSizeKB < 2048) {
      if (forceHosted) {
        console.warn('⚠️ forceHosted requested but no upload service available — falling back to data URL');
        console.warn('   Voice cloning WILL NOT WORK until you set UPLOADCARE_PUBLIC_KEY in Vercel');
      }
      console.log('✅ Data URL fallback');
      return res.status(200).json({
        success: true,
        url: `data:${mimeType};base64,${base64Data}`,
        hosted: false,
        service: 'dataurl',
      });
    }

    return res.status(500).json({ success: false, error: 'No upload service configured. Set UPLOADCARE_PUBLIC_KEY in Vercel.' });
  } catch (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '50mb' } } };
