// api/clone-voice.js — Voice cloning with 3-tier fallback
// Tier 1: Replicate RVC with user's TRAINED custom model (.pth)
// Tier 2: Seed-VC via HuggingFace (zero-shot, free)
// Tier 3: Replicate RVC with gender-matched preset voice
//
// Keys: REPLICATE_API_TOKEN (required for Tier 1 & 3)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      songUrl,
      voiceModelUrl,      // Trained .pth model URL (from RVC training)
      voiceSampleUrl,      // Raw audio URL (for Seed-VC)
      pitchShift = 0,
      gender = 'female',
    } = req.body;

    console.log('══════════════════════════════════════');
    console.log('🎤 VOICE CLONE REQUEST');
    console.log('   Song:', songUrl ? songUrl.substring(0, 80) : 'MISSING');
    console.log('   Trained model:', voiceModelUrl ? voiceModelUrl.substring(0, 80) : 'NONE');
    console.log('   Voice sample:', voiceSampleUrl ? voiceSampleUrl.substring(0, 80) : 'NONE');
    console.log('   Gender:', gender, '| Pitch:', pitchShift);
    console.log('══════════════════════════════════════');

    if (!songUrl) return res.status(400).json({ error: 'songUrl required' });

    const REP = process.env.REPLICATE_API_TOKEN;

    // ══════════════════════════════════════════════════
    // TIER 1: Replicate RVC with TRAINED custom model
    // This is the most reliable path — uses user's actual trained voice
    // ══════════════════════════════════════════════════
    if (voiceModelUrl && !voiceModelUrl.startsWith('preset:') && !voiceModelUrl.startsWith('data:') && REP) {
      console.log('🥇 TIER 1: Trying Replicate RVC with trained model...');
      const result = await tryReplicateRVC(songUrl, pitchShift, REP, {
        rvc_model: 'CUSTOM',
        custom_rvc_model_download_url: voiceModelUrl,
      });
      if (result) {
        console.log('✅ TIER 1 SUCCESS — User\'s trained voice model');
        return ok(res, result, 'rvc-trained', 'Voice cloned with your trained model!');
      }
      console.log('❌ TIER 1 failed — trying Tier 2...');
    } else if (voiceModelUrl && voiceModelUrl.startsWith('preset:')) {
      console.log('⚠️ Voice model is a preset tag, not a trained model — skipping Tier 1');
    }

    // ══════════════════════════════════════════════════
    // TIER 2: Seed-VC via HuggingFace (zero-shot)
    // Free, instant, but depends on HF Space being up
    // REQUIRES a publicly accessible URL (not data: URLs)
    // ══════════════════════════════════════════════════
    const sampleUrl = filterHostedUrl(voiceSampleUrl) || filterHostedUrl(voiceModelUrl);
    
    if (sampleUrl) {
      console.log('🥈 TIER 2: Trying Seed-VC (HuggingFace)...');
      const result = await trySeedVC(songUrl, sampleUrl, gender, pitchShift);
      if (result) {
        console.log('✅ TIER 2 SUCCESS — Seed-VC zero-shot conversion');
        return ok(res, result, 'seed-vc', 'Voice cloned with Seed-VC!');
      }
      console.log('❌ TIER 2 failed — trying Tier 3...');
    } else {
      const reason = (voiceSampleUrl || voiceModelUrl)
        ? 'Voice sample is a data: URL (not hosted). Set UPLOADCARE_PUBLIC_KEY in Vercel for voice cloning.'
        : 'No voice sample URL available';
      console.log(`⚠️ Skipping Tier 2: ${reason}`);
    }

    // ══════════════════════════════════════════════════
    // TIER 3: Replicate RVC with gender-matched preset
    // Always works, but uses a preset voice, not user's voice
    // ══════════════════════════════════════════════════
    if (REP) {
      const presetVoice = pickGenderPreset(gender);
      console.log(`🥉 TIER 3: Replicate RVC with preset "${presetVoice}"...`);
      const result = await tryReplicateRVC(songUrl, pitchShift, REP, {
        rvc_model: presetVoice,
      });
      if (result) {
        console.log('✅ TIER 3 SUCCESS — Preset voice applied');
        return ok(res, result, 'rvc-preset',
          `Used AI voice preset (${presetVoice}). For YOUR voice, ensure UPLOADCARE_PUBLIC_KEY is set and complete Voice Setup.`);
      }
      console.log('❌ TIER 3 failed');
    }

    // ══════════════════════════════════════════════════
    // ALL FAILED — return original AI song
    // ══════════════════════════════════════════════════
    console.log('⚠️ All voice cloning tiers failed — returning original AI vocals');
    return ok(res, songUrl, 'none', 'Voice cloning unavailable — using AI vocals. Please try again later.');

  } catch (error) {
    console.error('❌ clone-voice error:', error);
    const { songUrl } = req.body || {};
    return ok(res, songUrl || null, 'error', `Error: ${error.message}`);
  }
};

// ── Response helper ──
function ok(res, url, method, note) {
  return res.status(200).json({
    success: true,
    clonedAudioUrl: url,
    audioUrl: url,
    method: method || 'unknown',
    note: note || undefined,
  });
}

// ── Pick a gender-appropriate RVC preset ──
function pickGenderPreset(gender) {
  const g = (gender || '').toLowerCase();
  // These are built-in presets in zsxkib/realistic-voice-cloning
  if (g === 'm' || g === 'male') return 'OG';
  return 'Ariana Grande';
}

// ── Filter out non-hosted URLs (data:, preset:, blob:) ──
function filterHostedUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return null;
  if (url.startsWith('preset:')) return null;
  if (url.startsWith('blob:')) return null;
  if (url.length < 10) return null;
  return url;
}

// ══════════════════════════════════════════════════
// Replicate RVC — supports both CUSTOM and preset models
// ══════════════════════════════════════════════════
async function tryReplicateRVC(songUrl, pitchShift, apiToken, modelConfig) {
  try {
    const input = {
      song_input: songUrl,
      pitch_change: parseInt(pitchShift) || 0,
      index_rate: 0.5,
      filter_radius: 3,
      rms_mix_rate: 0.25,
      protect: 0.33,
      ...modelConfig,
    };

    console.log('   RVC config:', JSON.stringify({
      rvc_model: input.rvc_model,
      pitch_change: input.pitch_change,
      has_custom_url: !!input.custom_rvc_model_download_url,
    }));

    const r = await fetch('https://api.replicate.com/v1/models/zsxkib/realistic-voice-cloning/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=55',
      },
      body: JSON.stringify({ input }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.log('   ❌ RVC HTTP', r.status, errText.substring(0, 200));
      return null;
    }

    const pred = await r.json();

    if (pred.output) {
      return Array.isArray(pred.output) ? pred.output[0] : pred.output;
    }

    if (pred.id && pred.status !== 'failed') {
      console.log('   ⏳ RVC processing:', pred.id);
      for (let i = 0; i < 3; i++) {
        await sleep(5000);
        const sr = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
          headers: { Authorization: `Bearer ${apiToken}` },
        });
        if (!sr.ok) continue;
        const s = await sr.json();
        if (s.status === 'succeeded' && s.output) {
          return Array.isArray(s.output) ? s.output[0] : s.output;
        }
        if (s.status === 'failed') {
          console.log('   ❌ RVC failed:', s.error);
          return null;
        }
      }
    }

    if (pred.status === 'failed') {
      console.log('   ❌ RVC failed:', pred.error);
    }

    return null;
  } catch (e) {
    console.log('   ❌ RVC exception:', e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════
// Seed-VC via HuggingFace Gradio API
// The space exposes two endpoints:
//   /predict_1 = V1 model with F0 pitch control (best for SINGING)
//   /predict   = V2 model with style/emotion control (good fallback)
// ══════════════════════════════════════════════════
async function trySeedVC(songUrl, voiceUrl, gender, pitchShift) {
  const semitones = parseInt(pitchShift) || 0;
  const spaceUrl = 'https://plachta-seed-vc.hf.space';

  // Wake up the space (free HF spaces sleep after inactivity)
  try {
    console.log('   Waking Seed-VC space...');
    await fetch(spaceUrl, { method: 'GET', signal: AbortSignal.timeout(10000) });
    await sleep(3000);
  } catch (_) {
    console.log('   ⚠️ Wake ping timed out — trying anyway');
  }

  // Build proper Gradio FileData objects
  const sourceFileData = buildGradioFileData(songUrl, 'source_song.mp3');
  const refFileData = buildGradioFileData(voiceUrl, 'voice_sample.wav');
  
  console.log('   Source:', sourceFileData.url);
  console.log('   Reference:', refFileData.url);

  // ── Attempt 1: /predict_1 (V1 with F0 — best for singing voice) ──
  // Params: source_audio, ref_audio, diffusion_steps, length_adjust,
  //         inference_cfg_rate, f0_condition, auto_f0_adjust, pitch_shift
  try {
    console.log('   Trying /predict_1 (V1 singing model, F0 enabled)...');
    const result = await callSeedVCEndpoint(spaceUrl, 'predict_1', [
      sourceFileData,        // Source audio (the AI song)
      refFileData,           // Reference audio (user's voice)
      10,                    // Diffusion steps (default 10, fast)
      1.0,                   // Length adjust (1.0 = same length)
      0.7,                   // Inference CFG rate
      true,                  // F0 conditioned — CRITICAL for singing
      true,                  // Auto F0 adjust
      semitones,             // Pitch shift in semitones
    ]);
    if (result) return result;
  } catch (e) {
    console.log('   ❌ /predict_1 error:', e.message);
  }

  // ── Attempt 2: /predict (V2 with style control — fallback) ──
  // Params: source_audio, ref_audio, diffusion_steps, length_adjust,
  //         intelligibility_cfg_rate, similarity_cfg_rate, top_p,
  //         temperature, repetition_penalty, convert_style, anonymization_only
  try {
    console.log('   Trying /predict (V2 model, fallback)...');
    const result = await callSeedVCEndpoint(spaceUrl, 'predict', [
      sourceFileData,        // Source audio
      refFileData,           // Reference audio
      30,                    // Diffusion steps (V2 default is 30)
      1.0,                   // Length adjust
      0.0,                   // Intelligibility CFG rate
      0.7,                   // Similarity CFG rate
      0.9,                   // Top-p
      1.0,                   // Temperature
      1.0,                   // Repetition penalty
      false,                 // Convert style
      false,                 // Anonymization only
    ]);
    if (result) return result;
  } catch (e) {
    console.log('   ❌ /predict error:', e.message);
  }

  return null;
}

// ── Generic Gradio call + poll for a Seed-VC endpoint ──
async function callSeedVCEndpoint(spaceUrl, endpointName, dataArray) {
  const endpoint = `${spaceUrl}/gradio_api/call/${endpointName}`;

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: dataArray }),
    signal: AbortSignal.timeout(20000),
  });

  if (!r.ok) {
    const errText = (await r.text().catch(() => '')).slice(0, 150);
    console.log(`   ❌ ${endpointName}: HTTP ${r.status} — ${errText}`);
    return null;
  }

  const json = await r.json();
  if (!json.event_id) {
    console.log(`   ❌ ${endpointName}: no event_id in response`);
    return null;
  }

  console.log(`   📋 Event: ${json.event_id}`);
  return await pollSeedVC(endpoint, json.event_id, spaceUrl);
}

// ── Poll Seed-VC for completion ──
// Returns have 2 outputs: [stream_audio, full_audio] — we want full_audio (index 1)
async function pollSeedVC(endpoint, eventId, spaceUrl) {
  const maxWait = 120000; // 2 minutes max (singing VC can take a while)
  const start = Date.now();
  let polls = 0;

  while (Date.now() - start < maxWait) {
    polls++;
    try {
      const r = await fetch(`${endpoint}/${eventId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      });

      if (!r.ok) { await sleep(3000); continue; }

      const text = await r.text();
      let outputUrl = null;
      let isComplete = false;

      for (const line of text.split('\n')) {
        if (line.includes('event:') && line.includes('complete')) isComplete = true;
        if (line.includes('event:') && line.includes('error')) {
          // Try to extract error details
          const nextDataLine = text.split('\n').find(l => l.startsWith('data:') && text.indexOf(l) > text.indexOf(line));
          console.log('   ❌ Seed-VC error event', nextDataLine ? nextDataLine.slice(0, 200) : '');
          return null;
        }

        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.substring(5).trim());
            if (Array.isArray(data)) {
              // Response is [stream_output, full_output] — prefer full_output (index 1)
              const fullOutput = data[1] || data[0];
              if (fullOutput) {
                if (typeof fullOutput === 'string' && fullOutput.startsWith('http')) {
                  outputUrl = fullOutput;
                } else if (fullOutput?.url) {
                  outputUrl = fullOutput.url;
                } else if (fullOutput?.path) {
                  outputUrl = `${spaceUrl}/gradio_api/file=${fullOutput.path}`;
                } else if (fullOutput?.name) {
                  outputUrl = `${spaceUrl}/gradio_api/file=${fullOutput.name}`;
                }
              }
            }
          } catch (_) {}
        }
      }

      if (outputUrl && isComplete) {
        console.log(`   ✅ Seed-VC done (${polls} polls, ${Math.round((Date.now() - start) / 1000)}s)`);
        return outputUrl;
      }

    } catch (e) {
      if (polls <= 2) console.log(`   ⚠️ Poll error:`, e.message);
    }
    await sleep(4000);
  }

  console.log(`   ❌ Seed-VC timed out after ${Math.round((Date.now() - start) / 1000)}s (${polls} polls)`);
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Build proper Gradio FileData object ──
// Gradio expects: { path, url, orig_name, meta: { _type: "gradio.FileData" } }
function buildGradioFileData(url, filename) {
  return {
    path: url,
    url: url,
    orig_name: filename,
    meta: { _type: "gradio.FileData" }
  };
}
