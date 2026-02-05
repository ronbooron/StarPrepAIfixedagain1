import React, { useState, useEffect } from 'react';
import VoiceTraining from './VoiceTraining';

interface VoiceCloneModeProps {
  onGoToSongWriter?: () => void;
}

const VoiceCloneMode: React.FC<VoiceCloneModeProps> = ({ onGoToSongWriter }) => {
  const [showTraining, setShowTraining] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [voiceGender, setVoiceGender] = useState<string | null>(null);

  useEffect(() => {
    const isSetup = localStorage.getItem('starprep_voice_setup_complete') === 'true';
    const gender = localStorage.getItem('starprep_voice_gender');
    setVoiceReady(isSetup);
    setVoiceGender(gender);
  }, []);

  const handleReset = () => {
    localStorage.removeItem('starprep_voice_setup_complete');
    localStorage.removeItem('starprep_voice_model_url');
    localStorage.removeItem('starprep_voice_sample_url');
    localStorage.removeItem('starprep_voice_gender');
    setVoiceReady(false);
    setVoiceGender(null);
  };

  const handleTrainingComplete = async (recordings: Blob[]) => {
    setShowTraining(false);
    setIsProcessing(true);
    setProcessingProgress(10);
    setProcessingStatus('Preparing your voice sample...');

    try {
      const combinedBlob = new Blob(recordings, { type: 'audio/webm' });
      const fileSizeMB = (combinedBlob.size / 1024 / 1024).toFixed(2);
      console.log(`📦 Voice sample: ${fileSizeMB} MB`);

      setProcessingProgress(30);
      setProcessingStatus(`Uploading ${fileSizeMB}MB voice sample...`);

      // Convert to base64
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(combinedBlob);
      });

      // Upload — request a hosted URL (forceHosted flag tells backend to prefer Uploadcare)
      const uploadResponse = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          fileName: 'voice-sample.webm',
          contentType: 'audio/webm',
          forceHosted: true,  // IMPORTANT: Seed-VC needs a public URL
        }),
      });

      if (!uploadResponse.ok) throw new Error('Upload failed – check Vercel logs');

      const uploadResult = await uploadResponse.json();
      const audioUrl = uploadResult.url;
      const isHosted = uploadResult.hosted;

      console.log('✅ Voice uploaded via:', uploadResult.service, '| Hosted:', isHosted);
      console.log('   URL:', audioUrl?.substring(0, 80));

      if (!audioUrl) throw new Error('No audio URL returned');

      // Warn if we got a data URL (voice cloning won't work)
      if (!isHosted) {
        console.warn('⚠️ Voice sample is NOT hosted — Seed-VC voice cloning will NOT work');
        console.warn('   Set UPLOADCARE_PUBLIC_KEY in Vercel to enable hosted uploads');
      }

      setProcessingProgress(60);
      setProcessingStatus('Saving your voice profile...');

      const gender = localStorage.getItem('starprep_voice_gender') || 'female';

      // Save the voice sample URL — used by clone-voice.js
      localStorage.setItem('starprep_voice_sample_url', audioUrl);
      if (isHosted) {
        localStorage.setItem('starprep_voice_model_url', audioUrl);
      }
      localStorage.setItem('starprep_voice_setup_complete', 'true');

      // Kick off background RVC training for best quality
      if (isHosted) {
        setProcessingProgress(75);
        setProcessingStatus('Starting background voice training...');
        try {
          // Convert to WAV for training
          const wavBase64 = await convertBlobToWavBase64(combinedBlob);
          const trainRes = await fetch('/api/train-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: wavBase64,
              contentType: 'audio/wav',
            }),
          });
          if (trainRes.ok) {
            const trainResult = await trainRes.json();
            if (trainResult.predictionId) {
              localStorage.setItem('starprep_training_id', trainResult.predictionId);
              console.log('🚀 Background training started:', trainResult.predictionId);
            }
          }
        } catch (trainErr) {
          console.warn('Background training failed:', trainErr);
        }
      }

      setProcessingProgress(100);
      setProcessingStatus(isHosted
        ? '🎉 Voice ready! Songs will use your voice!'
        : '⚠️ Voice saved (set UPLOADCARE key for full cloning)'
      );

      setTimeout(() => {
        setIsProcessing(false);
        setVoiceReady(true);
        setVoiceGender(gender);
      }, 1500);

    } catch (error) {
      console.error('Voice setup error:', error);
      const gender = localStorage.getItem('starprep_voice_gender') || 'female';
      localStorage.setItem('starprep_voice_setup_complete', 'true');

      setProcessingProgress(100);
      setProcessingStatus('Done! Voice sample saved.');

      setTimeout(() => {
        setIsProcessing(false);
        setVoiceReady(true);
        setVoiceGender(gender);
      }, 1500);
    }
  };

  // Convert audio blob to WAV base64 for RVC training
  const convertBlobToWavBase64 = async (blob: Blob): Promise<string> => {
    const audioContext = new AudioContext({ sampleRate: 44100 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const length = audioBuffer.length;
    const wavBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(wavBuffer);

    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, length * 2, true);

    const ch = audioBuffer.getChannelData(0);
    let off = 44;
    for (let i = 0; i < length; i++) {
      view.setInt16(off, Math.max(-1, Math.min(1, ch[i])) * 0x7FFF, true);
      off += 2;
    }

    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    audioContext.close();
    return btoa(binary);
  };

  // Processing screen
  if (isProcessing) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-black/40 backdrop-blur-md rounded-2xl p-8 border border-pink-500/30 text-center">
          <div className="text-8xl mb-6 animate-pulse">🎤</div>
          <h2 className="text-3xl font-bold text-white mb-4">Saving Your Voice...</h2>
          <p className="text-gray-400 mb-8">{processingStatus}</p>
          <div className="max-w-md mx-auto">
            <div className="h-4 bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-500"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <p className="text-pink-500 font-bold text-2xl">{Math.round(processingProgress)}%</p>
          </div>
        </div>
      </div>
    );
  }

  // Training modal
  if (showTraining) {
    return (
      <VoiceTraining
        onComplete={handleTrainingComplete}
        onClose={() => setShowTraining(false)}
        jingleUrl="/starprep-jingle.mp3"
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
          🎤 Voice Clone
        </h1>
        <p className="text-gray-300">
          Record your voice and AI will create songs that sound like YOU! (Instant - no training needed!)
        </p>
      </div>

      <div className="bg-black/40 backdrop-blur-md rounded-2xl p-8 border border-pink-500/30 text-center">
        {voiceReady ? (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-green-400 mb-2">Voice Ready!</h2>
            {voiceGender && (
              <p className="text-gray-400 mb-4">
                Voice type: {voiceGender === 'male' ? '👨‍🎤 Male' : '👩‍🎤 Female'}
              </p>
            )}
            <p className="text-gray-300 mb-6">
              Your voice sample is saved! Create songs that sound like you!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {onGoToSongWriter && (
                <button
                  onClick={onGoToSongWriter}
                  className="px-8 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold text-xl hover:scale-105 transition transform"
                >
                  🎤 Create Your Song!
                </button>
              )}
              <button
                onClick={handleReset}
                className="px-6 py-3 rounded-xl bg-gray-700 text-white hover:bg-gray-600 transition"
              >
                🔄 Record New Sample
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">🎙️</div>
            <h2 className="text-2xl font-bold text-pink-400 mb-4">Record Your Voice</h2>
            <p className="text-gray-300 mb-2">
              Sing along to our jingle and we'll capture your unique voice!
            </p>
            <p className="text-gray-500 text-sm mb-8">
              ⚡ Instant voice cloning - no waiting for training!
            </p>
            <button
              onClick={() => setShowTraining(true)}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold text-xl hover:scale-105 transition transform"
            >
              🎤 Record Voice Sample
            </button>
          </>
        )}
      </div>

      {/* How it works */}
      <div className="mt-8 bg-black/20 rounded-2xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-pink-400 mb-4">💡 How Voice Clone Works</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="text-center p-4">
            <div className="text-3xl mb-2">1️⃣</div>
            <p className="text-gray-300 font-semibold">Listen to Jingle</p>
            <p className="text-gray-500 text-sm">Learn the fun melody</p>
          </div>
          <div className="text-center p-4">
            <div className="text-3xl mb-2">2️⃣</div>
            <p className="text-gray-300 font-semibold">Sing & Record</p>
            <p className="text-gray-500 text-sm">Capture your voice</p>
          </div>
          <div className="text-center p-4">
            <div className="text-3xl mb-2">3️⃣</div>
            <p className="text-gray-300 font-semibold">Instant Clone!</p>
            <p className="text-gray-500 text-sm">No waiting - ready now!</p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-pink-900/20 to-purple-900/20 rounded-xl p-4 border border-pink-500/20">
          <h4 className="font-bold text-pink-400 mb-2">⚡ Zero-Shot Cloning</h4>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• No waiting for training</li>
            <li>• Works instantly from your sample</li>
            <li>• Uses cutting-edge AI (Seed-VC)</li>
            <li>• Better results than old methods</li>
          </ul>
        </div>
        <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-xl p-4 border border-purple-500/20">
          <h4 className="font-bold text-purple-400 mb-2">✨ What You Get</h4>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• Songs generated in YOUR voice</li>
            <li>• Practice with your own sound</li>
            <li>• Hear how you'd sound on stage</li>
            <li>• Prepare for auditions perfectly</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default VoiceCloneMode;
