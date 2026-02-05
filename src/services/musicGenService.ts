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
 * Poll for song completion - runs on frontend to avoid server timeout
 */
async function pollForSong(taskId: string, onProgress?: (status: string) => void): Promise<string> {
  const maxAttempts = 120; // 4 minutes max (2 sec intervals)
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    if (onProgress) {
      if (attempts < 10) onProgress('Starting generation...');
      else if (attempts < 30) onProgress('AI is composing your song...');
      else if (attempts < 60) onProgress('Adding vocals and mixing...');
      else onProgress('Almost done, finalizing...');
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/check-song?taskId=${taskId}`);
      const result = await response.json();
      
      console.log(`🔍 Poll ${attempts}: status=${result.status}`);
      
      if (result.ready && result.audioUrl) {
        console.log('✅ Song ready:', result.audioUrl);
        return result.audioUrl;
      }
      
      if (result.status === 'FAILED') {
        throw new Error(result.error || 'Song generation failed');
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('Poll error:', error);
      // Continue polling on network errors
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('Song generation timed out. Please try again.');
}

/**
 * Generates audio track from song data using Kie.ai (Suno V5)
 * Uses polling approach to avoid Vercel timeout
 */
export async function generateTrackAudio(
  song: SongResult, 
  onProgress?: (status: string) => void,
  vocalGender: string = 'f'
): Promise<string> {
  console.log('🎵 Starting audio generation for:', song.title);

  try {
    // Step 1: Start the generation (returns immediately)
    if (onProgress) onProgress('Initializing AI composer...');
    
    const startResponse = await fetch(`${API_BASE_URL}/api/start-song`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lyrics: song.lyrics,
        style: `${song.genre?.toLowerCase() || 'pop'}, professional vocals, high quality, radio-ready`,
        title: song.title || 'StarPrep Song',
        vocalGender: vocalGender,
      }),
    });

    if (!startResponse.ok) {
      const errorData = await startResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${startResponse.status}`);
    }

    const startResult = await startResponse.json();
    
    if (!startResult.success || !startResult.taskId) {
      throw new Error(startResult.error || 'Failed to start generation');
    }

    console.log('✅ Generation started, taskId:', startResult.taskId);
    
    // Step 2: Poll for completion (runs on frontend)
    const audioUrl = await pollForSong(startResult.taskId, onProgress);
    
    return audioUrl;
    
  } catch (error) {
    console.error('❌ Audio generation failed:', error);
    throw error;
  }
}

/**
 * Generates instrumental track (karaoke version) using Kie.ai
 */
export async function generateInstrumentalTrack(
  song: SongResult,
  onProgress?: (status: string) => void
): Promise<string> {
  console.log('🎵 Starting instrumental track for:', song.title);

  try {
    if (onProgress) onProgress('Initializing instrumental generation...');
    
    const startResponse = await fetch(`${API_BASE_URL}/api/start-song`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lyrics: song.lyrics,
        style: `${song.genre?.toLowerCase() || 'pop'}, instrumental, high quality, radio-ready`,
        title: song.title || 'StarPrep Song (Instrumental)',
        instrumental: true,
      }),
    });

    if (!startResponse.ok) {
      const errorData = await startResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${startResponse.status}`);
    }

    const startResult = await startResponse.json();
    
    if (!startResult.success || !startResult.taskId) {
      throw new Error(startResult.error || 'Failed to start generation');
    }

    console.log('✅ Instrumental started, taskId:', startResult.taskId);
    
    const audioUrl = await pollForSong(startResult.taskId, onProgress);
    
    return audioUrl;
    
  } catch (error) {
    console.error('❌ Instrumental generation failed:', error);
    throw error;
  }
}

/**
 * Clones the user's voice and applies it to a track
 * Uses 3-tier system: trained RVC model → Seed-VC → gender preset
 */
export async function generateClonedTrack(
  song: SongResult, 
  referenceAudio: File | Blob,
  voiceModel: string,
  onProgress?: (status: string) => void,
  gender: string = 'f'
): Promise<string> {
  console.log('🎤 Generating cloned track...');
  console.log('   Song:', song.title);

  try {
    // Gather all voice data from localStorage
    const savedVoiceSampleUrl = localStorage.getItem('starprep_voice_sample_url');
    const savedVoiceModelUrl = localStorage.getItem('starprep_trained_model_url'); // Trained .pth model
    const savedGender = localStorage.getItem('starprep_voice_gender') || gender;
    const trainingId = localStorage.getItem('starprep_training_id');

    console.log('   Voice sample URL:', savedVoiceSampleUrl ? savedVoiceSampleUrl.substring(0, 60) : 'None');
    console.log('   Trained model URL:', savedVoiceModelUrl ? savedVoiceModelUrl.substring(0, 60) : 'None');
    console.log('   Training ID:', trainingId || 'None');
    console.log('   Gender:', savedGender);

    // If there's a training ID but no model yet, check if training completed
    if (trainingId && !savedVoiceModelUrl) {
      if (onProgress) onProgress('Checking voice model training status...');
      try {
        const checkRes = await fetch(`${API_BASE_URL}/api/check-training?predictionId=${trainingId}`);
        if (checkRes.ok) {
          const checkResult = await checkRes.json();
          if (checkResult.status === 'COMPLETE' && checkResult.modelUrl) {
            localStorage.setItem('starprep_trained_model_url', checkResult.modelUrl);
            console.log('🎉 Training just completed! Model:', checkResult.modelUrl.substring(0, 60));
          }
        }
      } catch (e) {
        console.warn('Training check failed:', e);
      }
    }

    // Re-read in case we just updated it
    const trainedModelUrl = localStorage.getItem('starprep_trained_model_url');

    // Step 1: Generate the base song
    if (onProgress) onProgress('Generating base song...');
    console.log('📝 Step 1: Generating base song...');
    const baseSongUrl = await generateTrackAudio(song, onProgress, savedGender);

    // Step 2: Clone the voice onto the song
    if (onProgress) onProgress('Applying your voice...');
    console.log('🎤 Step 2: Cloning voice onto track...');

    const cloneResponse = await fetch(`${API_BASE_URL}/api/clone-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songUrl: baseSongUrl,
        voiceModelUrl: trainedModelUrl || null,     // Trained .pth model (Tier 1)
        voiceSampleUrl: savedVoiceSampleUrl || null, // Raw audio URL (Tier 2 - Seed-VC)
        gender: savedGender,
        pitchShift: 0,
      }),
    });

    if (!cloneResponse.ok) {
      const error = await cloneResponse.json().catch(() => ({}));
      throw new Error(error.error || 'Voice cloning failed');
    }

    const cloneResult = await cloneResponse.json();
    const clonedUrl = cloneResult.clonedAudioUrl || cloneResult.audioUrl;

    console.log('✅ Clone result:', cloneResult.method, '|', cloneResult.note || 'OK');
    
    if (cloneResult.note && onProgress) {
      onProgress(cloneResult.note);
    }

    return clonedUrl;

  } catch (error) {
    console.error('❌ Cloned track generation failed:', error);
    throw error;
  }
}

/**
 * Polls training status in the background (call this periodically)
 * Returns the trained model URL when ready, or null if still training
 */
export async function checkTrainingStatus(): Promise<string | null> {
  const trainingId = localStorage.getItem('starprep_training_id');
  const existingModel = localStorage.getItem('starprep_trained_model_url');
  
  if (existingModel) return existingModel; // Already trained
  if (!trainingId) return null; // No training in progress

  try {
    const res = await fetch(`${API_BASE_URL}/api/check-training?predictionId=${trainingId}`);
    if (!res.ok) return null;

    const result = await res.json();
    
    if (result.status === 'COMPLETE' && result.modelUrl) {
      localStorage.setItem('starprep_trained_model_url', result.modelUrl);
      console.log('🎉 Voice model training complete!');
      return result.modelUrl;
    }

    if (result.status === 'FAILED') {
      console.warn('Voice training failed:', result.error);
      localStorage.removeItem('starprep_training_id'); // Don't keep polling
      return null;
    }

    return null; // Still training
  } catch {
    return null;
  }
}

/**
 * Generate a full AI song with vocals using Kie.ai (Suno V5)
 */
export async function generateFullSong(
  lyrics: string,
  style: string,
  _duration: number = 60,
  onProgress?: (status: string) => void,
  vocalGender: string = 'f'
): Promise<string> {
  console.log('🎵 Generating full song with AI vocals...');
  
  try {
    if (onProgress) onProgress('Starting AI song generation...');
    
    const startResponse = await fetch(`${API_BASE_URL}/api/start-song`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        lyrics, 
        style: style || 'pop, professional vocals, high quality',
        title: 'StarPrep Song',
        vocalGender: vocalGender,
      }),
    });

    if (!startResponse.ok) {
      const error = await startResponse.json().catch(() => ({}));
      throw new Error(error.error || 'Song generation failed');
    }

    const startResult = await startResponse.json();
    
    if (!startResult.success || !startResult.taskId) {
      throw new Error(startResult.error || 'Failed to start generation');
    }

    console.log('✅ Full song started, taskId:', startResult.taskId);
    
    const audioUrl = await pollForSong(startResult.taskId, onProgress);
    
    return audioUrl;
  } catch (error) {
    console.error('❌ Full song generation failed:', error);
    throw error;
  }
}

/**
 * Separate vocals from instrumentals for karaoke mode
 */
export async function separateStems(audioUrl: string): Promise<{ vocalsUrl: string; instrumentalUrl: string }> {
  console.log('🎵 Separating stems for karaoke...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/separate-stems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Stem separation failed');
    }

    const result = await response.json();
    console.log('✅ Stems separated!');
    
    return {
      vocalsUrl: result.vocalsUrl,
      instrumentalUrl: result.instrumentalUrl,
    };
  } catch (error) {
    console.error('❌ Stem separation failed:', error);
    throw error;
  }
}
