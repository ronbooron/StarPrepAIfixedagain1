import { SongResult } from '../types';

// API is on the same domain (Vercel serverless functions)
const API_BASE_URL = '';

/**
 * Converts a Blob to base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generates a song from audio input
 * 1. Uploads the audio to get a URL
 * 2. Transcribes the audio (4 words)
 * 3. Generates lyrics from the words
 * 4. Returns the song data
 */
export async function generateSongFromAudio(blob: Blob): Promise<SongResult> {
  console.log('🎤 Processing audio for song generation...');
  console.log('   Blob size:', blob.size, 'bytes');
  console.log('   Blob type:', blob.type);

  // Step 1: Convert audio to base64
  const audioBase64 = await blobToBase64(blob);
  console.log('   Base64 length:', audioBase64.length);

  // Step 2: Upload audio to get a URL
  console.log('📤 Uploading audio...');
  let audioUrl = '';
  let audioBase64ForTranscribe = audioBase64;  // Keep base64 for transcription
  
  try {
    const uploadResponse = await fetch(`${API_BASE_URL}/api/upload-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        audioBase64,
        fileName: `recording-${Date.now()}.webm`,
        contentType: blob.type || 'audio/webm'
      }),
    });

    if (uploadResponse.ok) {
      const uploadResult = await uploadResponse.json();
      audioUrl = uploadResult.url;
      console.log('✅ Audio uploaded:', audioUrl.substring(0, 50) + '...');
    } else {
      console.error('❌ Upload failed:', await uploadResponse.text());
      throw new Error('Failed to upload audio');
    }
  } catch (error) {
    console.error('❌ Upload error:', error);
    throw new Error('Failed to upload audio');
  }

  // Step 3: Transcribe the audio
  // IMPORTANT: Use base64 data URL for transcription (more reliable than Uploadcare URL)
  // Uploadcare files can take a moment to propagate — Whisper needs instant access
  console.log('🎧 Transcribing audio...');
  let transcription = '';
  
  try {
    const transcribeResponse = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: audioBase64ForTranscribe }),
    });

    if (transcribeResponse.ok) {
      const transcribeResult = await transcribeResponse.json();
      transcription = transcribeResult.transcription || transcribeResult.text || transcribeResult.words || '';
      console.log('✅ Transcription:', transcription);
    } else {
      console.error('❌ Transcription failed:', await transcribeResponse.text());
      throw new Error('Failed to transcribe audio');
    }
  } catch (error) {
    console.error('❌ Transcription error:', error);
    throw new Error('Failed to transcribe audio');
  }

  if (!transcription || transcription.trim().length === 0) {
    throw new Error('No words detected in audio. Please try again and speak clearly.');
  }

  // Step 4: Generate lyrics from the words
  console.log('📝 Generating lyrics from:', transcription);
  console.log('🎯 YOUR 4 WORDS ARE:', transcription);
  
  try {
    const lyricsResponse = await fetch(`${API_BASE_URL}/api/generate-lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        words: transcription,
        style: 'Pop',
      }),
    });

    if (!lyricsResponse.ok) {
      console.error('❌ Lyrics generation failed:', await lyricsResponse.text());
      throw new Error('Failed to generate lyrics');
    }

    const lyricsResult = await lyricsResponse.json();
    const lyrics = lyricsResult.lyrics || lyricsResult.data?.lyrics || '';
    const title = lyricsResult.title || lyricsResult.data?.title || 'Your Song';
    
    console.log('✅ Lyrics generated! Title:', title);

    return {
      title: title,
      genre: 'Pop',
      detectedWords: transcription,
      vocalAnalysis: `Song created from your words: "${transcription}". This track is designed to showcase your vocal range.`,
      lyrics: lyrics,
      chords: 'C - G - Am - F (I - V - vi - IV)',
      structure: 'Verse - Chorus - Verse - Chorus - Bridge - Outro',
    };

  } catch (error) {
    console.error('❌ Lyrics generation error:', error);
    throw error;
  }
}

/**
 * Generates audio track from song lyrics using Kie.ai (Suno V5)
 * Step 1: POST /api/start-song  → returns taskId immediately
 * Step 2: Poll GET /api/check-song?taskId=xxx until audioUrl is ready
 */
export async function generateSongAudio(lyrics: string, style: string): Promise<string> {
  console.log('🎵 Generating audio track with Kie.ai...');

  try {
    // ── Step 1: kick off generation ──────────────────────────────
    const startResponse = await fetch(`${API_BASE_URL}/api/start-song`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lyrics,
        style: style || 'pop, professional vocals, high quality, radio-ready',
        title: 'StarPrep Song',
        vocalGender: 'f',
      }),
    });

    if (!startResponse.ok) {
      const err = await startResponse.json().catch(() => ({}));
      throw new Error(err.error || `start-song failed: ${startResponse.status}`);
    }

    const startResult = await startResponse.json();
    if (!startResult.success || !startResult.taskId) {
      throw new Error(startResult.error || 'No taskId returned from start-song');
    }

    const taskId = startResult.taskId;
    console.log('✅ Song generation started, taskId:', taskId);

    // ── Step 2: poll check-song until the audio is ready ─────────
    const maxAttempts = 120; // 4 minutes max (2 s intervals)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const checkResponse = await fetch(`${API_BASE_URL}/api/check-song?taskId=${taskId}`);
      const checkResult = await checkResponse.json();

      console.log(`🔍 Poll ${attempt}: status=${checkResult.status}`);

      if (checkResult.ready && checkResult.audioUrl) {
        console.log('✅ Audio generated:', checkResult.audioUrl);
        return checkResult.audioUrl;
      }

      if (checkResult.status === 'FAILED') {
        throw new Error(checkResult.error || 'Song generation failed');
      }
    }

    throw new Error('Song generation timed out after 4 minutes. Please try again.');
  } catch (error) {
    console.error('❌ Audio generation failed:', error);
    throw error;
  }
}

/**
 * Clones a voice and applies it to a song using Replicate RVC
 */
export async function cloneVoice(audioBlob: Blob, songUrl: string): Promise<string> {
  console.log('🎤 Cloning voice...');
  
  try {
    // First upload the voice sample
    const audioBase64 = await blobToBase64(audioBlob);
    
    const uploadResponse = await fetch(`${API_BASE_URL}/api/upload-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, fileName: 'voice-sample.webm' }),
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload voice sample');
    }

    const uploadResult = await uploadResponse.json();
    const voiceSampleUrl = uploadResult.url;

    // Clone the voice onto the song
    const response = await fetch(`${API_BASE_URL}/api/clone-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        voiceSampleUrl,
        songUrl,
        pitchShift: 0,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to clone voice');
    }

    const result = await response.json();
    console.log('✅ Voice cloned!', result.clonedAudioUrl);
    
    return result.clonedAudioUrl || result.audioUrl;
  } catch (error) {
    console.error('❌ Voice cloning failed:', error);
    throw error;
  }
}

/**
 * Synthesizes speech - redirects to clone voice (kept for backward compatibility)
 */
export async function synthesizeVoice(_text: string, _voiceId: string): Promise<string> {
  console.log('🔊 Voice synthesis not available in new API');
  throw new Error('Voice synthesis has been replaced with voice cloning');
}
