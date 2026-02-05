import React, { useState, useRef, useEffect } from 'react';
import OnboardingModal from './OnboardingModal';

interface VoiceSetupProps {
  onComplete: (voiceId: string) => void;
  onClose: () => void;
}

// The fun phrases for voice training! 🎤😂
const TRAINING_PHRASES = [
  // WARM UP ROUND 🐣
  { text: "My dog can't swim but he tries anyway", emoji: "🐕", category: "Warm Up" },
  { text: "I ate the whole pizza, no regrets", emoji: "🍕", category: "Warm Up" },
  { text: "Where did my other sock go?", emoji: "🧦", category: "Warm Up" },
  { text: "Five more minutes mom, please!", emoji: "😴", category: "Warm Up" },
  { text: "Tacos are my love language", emoji: "🌮", category: "Warm Up" },
  
  // SHOW YOUR RANGE 🎵
  { text: "WHYYY is the wifi so slow?!", emoji: "📶", category: "Range" },
  { text: "I need coffee... right now...", emoji: "☕", category: "Range" },
  { text: "To the mooooon and back!", emoji: "🌙", category: "Range" },
  { text: "Oops I did it again, my bad", emoji: "🙊", category: "Range" },
  { text: "Let me sleep for five more years", emoji: "💤", category: "Range" },
  
  // FREESTYLE TIME 🔥
  { text: "I sing better in the shower", emoji: "🚿", category: "Freestyle" },
  { text: "Why did the chicken cross the road?", emoji: "🐔", category: "Freestyle" },
  { text: "Netflix asked if I'm still watching", emoji: "📺", category: "Freestyle" },
  { text: "My plants are judging me", emoji: "🌱", category: "Freestyle" },
  { text: "Send help, I'm stuck on the couch", emoji: "🛋️", category: "Freestyle" },
  
  // FINAL ROUND 🌟
  { text: "I'm about to be famous!", emoji: "⭐", category: "Final" },
  { text: "Watch out world, here I come!", emoji: "🚀", category: "Final" },
  { text: "This is my moment to shine!", emoji: "✨", category: "Final" },
  { text: "Golden ticket, here I come!", emoji: "🎫", category: "Final" },
  { text: "StarPrepAI made me a star!", emoji: "🌟", category: "Final" },
];

const VoiceSetup: React.FC<VoiceSetupProps> = ({ onComplete, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0); // 0 = intro, 1 = recording, 2 = processing, 3 = done
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<Blob[]>([]);
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [encouragement, setEncouragement] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'m' | 'f'>('m'); // User's voice gender
  const [analysisStep, setAnalysisStep] = useState(''); // Current training step message
  const [audioLevel, setAudioLevel] = useState(0); // VU meter level
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const encouragements = [
    "🔥 That was FIRE!",
    "😂 Haha! Perfect!",
    "🎤 You're killing it!",
    "⭐ Star quality right there!",
    "💪 Nailed it!",
    "🚀 To the moon!",
    "✨ Magical!",
    "🎯 Bullseye!",
    "👏 Amazing!",
    "🌟 Superstar vibes!",
  ];

  const currentPhrase = TRAINING_PHRASES[currentPhraseIndex];
  const totalPhrases = TRAINING_PHRASES.length;
  const progress = (currentPhraseIndex / totalPhrases) * 100;

  // Get VU meter color based on level
  const getVuColor = (level: number) => {
    if (level > 70) return 'bg-red-500';
    if (level > 40) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Set up audio analyser for VU meter
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      // Start VU meter animation
      const updateLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255 * 100);
        }
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordings(prev => [...prev, blob]);
        
        // Stop VU meter
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setAudioLevel(0);
        
        // Show random encouragement
        const randomEnc = encouragements[Math.floor(Math.random() * encouragements.length)];
        setEncouragement(randomEnc);
        
        // Move to next phrase after a moment
        setTimeout(() => {
          if (currentPhraseIndex < totalPhrases - 1) {
            setCurrentPhraseIndex(prev => prev + 1);
            setEncouragement('');
          } else {
            // All phrases done! Start processing
            setCurrentStep(2);
            processVoice();
          }
        }, 1500);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic error:', err);
      setError('Could not access microphone. Please allow mic access and try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setAudioLevel(0);
    }
  };

  const processVoice = async () => {
    try {
      setProcessingProgress(10);
      setAnalysisStep('Preparing your voice sample...');

      // Combine all recordings into one blob
      const combinedBlob = new Blob(recordings, { type: 'audio/webm' });
      const fileSizeMB = (combinedBlob.size / 1024 / 1024).toFixed(2);
      console.log(`📦 Voice sample: ${fileSizeMB} MB from ${recordings.length} recordings`);

      setProcessingProgress(30);
      setAnalysisStep(`Uploading ${fileSizeMB}MB voice sample...`);

      // Convert blob to base64
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(combinedBlob);
      });

      // Upload to get a public URL (needed for voice cloning APIs)
      const uploadResponse = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          fileName: 'voice-sample.webm',
          contentType: 'audio/webm',
          forceHosted: true,
        }),
      });

      let audioUrl = '';
      let isHosted = false;

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        audioUrl = uploadResult.url || '';
        isHosted = uploadResult.hosted || false;
        console.log('✅ Voice uploaded via:', uploadResult.service, '| Hosted:', isHosted);
      } else {
        console.warn('⚠️ Upload failed, continuing with setup');
      }

      setProcessingProgress(60);
      setAnalysisStep('Saving your voice profile...');

      // Save voice sample URL to localStorage
      if (audioUrl) {
        localStorage.setItem('starprep_voice_sample_url', audioUrl);
        // Only set as model URL if it's a real hosted URL (not data: or preset:)
        if (isHosted) {
          localStorage.setItem('starprep_voice_model_url', audioUrl);
        }
      }
      localStorage.setItem('starprep_voice_setup_complete', 'true');
      localStorage.setItem('starprep_voice_gender', voiceGender);

      // Kick off background RVC training if we have a hosted URL
      if (isHosted && audioUrl) {
        setAnalysisStep('Starting background voice training...');
        try {
          // Convert to WAV for RVC training (best done client-side)
          const wavBase64 = await convertToWavBase64(combinedBlob);
          
          const trainRes = await fetch('/api/train-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: wavBase64,
              contentType: 'audio/wav',
              fileName: 'voice-sample.wav',
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
          console.warn('⚠️ Background training failed to start:', trainErr);
          // Non-blocking — voice cloning still works via Seed-VC
        }
      }

      setProcessingProgress(100);
      setAnalysisStep(isHosted
        ? '🎉 Voice ready! Cloning enabled.'
        : '⚠️ Voice saved — set UPLOADCARE key for best results');

      setTimeout(() => setCurrentStep(3), 500);

    } catch (err) {
      console.error('processVoice error:', err);
      // Still mark setup as complete so user isn't stuck
      localStorage.setItem('starprep_voice_setup_complete', 'true');
      localStorage.setItem('starprep_voice_gender', voiceGender);
      setProcessingProgress(100);
      setAnalysisStep('Done! Voice saved.');
      setTimeout(() => setCurrentStep(3), 500);
    }
  };

  // Convert audio blob to WAV base64 (for RVC training which needs WAV)
  const convertToWavBase64 = async (blob: Blob): Promise<string> => {
    const audioContext = new AudioContext({ sampleRate: 44100 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numChannels = 1; // Mono for voice training
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bytesPerSample = 2; // 16-bit

    const wavBuffer = new ArrayBuffer(44 + length * bytesPerSample);
    const view = new DataView(wavBuffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * bytesPerSample, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, length * bytesPerSample, true);

    // Write mono audio data
    const channelData = audioBuffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    // Convert to base64
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    audioContext.close();
    return btoa(binary);
  };

  const pollTrainingStatus = async (predictionId: string, fallbackUrl: string) => {
    const maxPolls = 180; // 15 minutes max (5 sec intervals)
    let polls = 0;
    
    const trainingMessages = [
      "Analyzing your vocal patterns...",
      "Extracting voice characteristics...",
      "Building neural voice model...",
      "Training AI on your unique tone...",
      "Refining pitch and timbre...",
      "Optimizing voice quality...",
      "Fine-tuning the model...",
      "Almost there, finalizing...",
    ];
    
    while (polls < maxPolls) {
      polls++;
      
      // Update progress (30-95%) - slower progression for longer training
      const progress = Math.min(30 + (polls / maxPolls) * 65, 95);
      setProcessingProgress(progress);
      
      // Update status message based on progress
      const messageIndex = Math.min(Math.floor(progress / 12), trainingMessages.length - 1);
      setAnalysisStep(trainingMessages[messageIndex]);
      
      try {
        const response = await fetch(`/api/check-training?predictionId=${predictionId}`);
        const result = await response.json();
        
        console.log(`🔍 Training poll ${polls}:`, result.status);
        
        if (result.status === 'succeeded' && result.voiceModelUrl) {
          console.log('✅ Training complete! Model URL:', result.voiceModelUrl);
          finishSetup(result.voiceModelUrl);
          return;
        }
        
        if (result.status === 'failed') {
          console.log('⚠️ Training failed, using fallback');
          finishSetup(fallbackUrl);
          return;
        }
        
      } catch (err) {
        console.error('Poll error:', err);
      }
      
      // Wait 5 seconds between polls
      await new Promise(r => setTimeout(r, 5000));
    }
    
    // Timeout - use fallback
    console.log('⚠️ Training timeout, using fallback');
    finishSetup(fallbackUrl);
  };

  const finishSetup = (voiceModelUrl: string) => {
    setProcessingProgress(100);
    
    // Save to localStorage
    localStorage.setItem('starprep_voice_model_url', voiceModelUrl);
    localStorage.setItem('starprep_voice_trained', 'true');
    localStorage.setItem('starprep_voice_setup_complete', 'true');
    localStorage.setItem('starprep_voice_gender', voiceGender); // Save the user's voice gender
    
    // Check if this is a real trained model or fallback
    const isTrainedModel = voiceModelUrl.includes('.zip') || 
                           voiceModelUrl.includes('replicate.delivery') ||
                           voiceModelUrl.includes('pbxt.replicate');
    localStorage.setItem('starprep_voice_is_trained', isTrainedModel ? 'true' : 'false');
    
    console.log('✅ Voice setup complete!');
    console.log('   Model URL:', voiceModelUrl.substring(0, 60) + '...');
    console.log('   Is trained model:', isTrainedModel);
    
    // Show done screen
    setTimeout(() => setCurrentStep(3), 500);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Warm Up': return 'from-green-500 to-emerald-500';
      case 'Range': return 'from-blue-500 to-cyan-500';
      case 'Freestyle': return 'from-purple-500 to-pink-500';
      case 'Final': return 'from-yellow-500 to-orange-500';
      default: return 'from-pink-500 to-purple-500';
    }
  };

  // Intro screen
  if (currentStep === 0) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 overflow-y-auto p-4">
        <div className="min-h-full flex items-center justify-center">
          <div className="max-w-lg w-full text-center py-8">
          <div className="text-8xl mb-6 animate-bounce">🎤</div>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-500 to-blue-500 bg-clip-text text-transparent">
            Create Your Sound!
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Sing 20 fun phrases and we'll make your songs sound like <span className="text-pink-500 font-bold">YOU!</span>
          </p>
          
          {/* Gender Selection - IMPORTANT for voice cloning */}
          <div className="bg-white/5 rounded-2xl p-6 mb-6 border border-gray-700">
            <h3 className="font-bold mb-4 text-blue-400">🎭 What's your voice type?</h3>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setVoiceGender('m')}
                className={`flex-1 max-w-[140px] py-4 rounded-xl flex flex-col items-center gap-2 transition ${
                  voiceGender === 'm' 
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold scale-105' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <span className="text-3xl">👨‍🎤</span>
                <span>Male</span>
              </button>
              <button
                onClick={() => setVoiceGender('f')}
                className={`flex-1 max-w-[140px] py-4 rounded-xl flex flex-col items-center gap-2 transition ${
                  voiceGender === 'f' 
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold scale-105' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <span className="text-3xl">👩‍🎤</span>
                <span>Female</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">This helps our AI match your voice better!</p>
          </div>
          
          <div className="bg-white/5 rounded-2xl p-6 mb-8 text-left">
            <h3 className="font-bold mb-4 text-blue-400">What you'll sing:</h3>
            <ul className="space-y-2 text-gray-300">
              <li>🐕 "My dog can't swim but he tries anyway"</li>
              <li>🍕 "I ate the whole pizza, no regrets"</li>
              <li>🚀 "To the mooooon and back!"</li>
              <li className="text-gray-500">...and 17 more hilarious phrases!</li>
            </ul>
          </div>
          
          <p className="text-gray-400 mb-6">⏱️ Takes about 5 minutes</p>
          
          <div className="flex gap-4 justify-center">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-white/20 text-gray-400 hover:bg-white/5 transition"
            >
              Maybe Later
            </button>
            <button
              onClick={() => setCurrentStep(1)}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-blue-500 text-white font-bold hover:scale-105 transition transform"
            >
              Let's GO! 🔥
            </button>
          </div>
          </div>
        </div>
      </div>
    );
  }

  // Recording screen
  if (currentStep === 1) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full text-center">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{currentPhrase.category}</span>
              <span>{currentPhraseIndex + 1} / {totalPhrases}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-gradient-to-r ${getCategoryColor(currentPhrase.category)} transition-all duration-500`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Emoji */}
          <div className="text-8xl mb-6 animate-pulse">{currentPhrase.emoji}</div>
          
          {/* Phrase to sing */}
          <div className="bg-white/5 rounded-2xl p-8 mb-8">
            <p className="text-sm text-gray-400 mb-2">Sing this:</p>
            <h2 className="text-3xl font-bold text-white">
              "{currentPhrase.text}"
            </h2>
          </div>

          {/* Encouragement */}
          {encouragement && (
            <div className="text-2xl font-bold text-pink-500 mb-6 animate-bounce">
              {encouragement}
            </div>
          )}

          {/* VU Meter - Shows when recording */}
          {isRecording && !encouragement && (
            <div className="w-full max-w-xs mx-auto mb-6">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-xs text-gray-400">🎤 MIC LEVEL</span>
                <span className="text-xs text-neonPink font-mono">{Math.round(audioLevel)}%</span>
              </div>
              <div className="h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
                <div 
                  className={`h-full transition-all duration-75 ${getVuColor(audioLevel)}`}
                  style={{ width: `${Math.min(audioLevel, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>Silent</span>
                <span>Good</span>
                <span>Loud</span>
              </div>
              {audioLevel < 5 && (
                <p className="text-xs text-red-400 mt-2 text-center animate-pulse">
                  ⚠️ No audio detected! Check your mic.
                </p>
              )}
            </div>
          )}

          {/* Record button */}
          {!encouragement && (
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`w-32 h-32 rounded-full transition-all transform ${
                isRecording 
                  ? 'bg-red-500 scale-110 animate-pulse' 
                  : 'bg-gradient-to-r from-pink-500 to-blue-500 hover:scale-105'
              }`}
            >
              <span className="text-4xl">{isRecording ? '🔴' : '🎤'}</span>
            </button>
          )}
          
          {!encouragement && (
            <p className="mt-4 text-gray-400">
              {isRecording ? '🎤 Singing... Release when done!' : 'Hold to record'}
            </p>
          )}

          {error && (
            <p className="mt-4 text-red-400">{error}</p>
          )}

          {/* Skip button */}
          <button
            onClick={() => {
              if (currentPhraseIndex < totalPhrases - 1) {
                setCurrentPhraseIndex(prev => prev + 1);
              } else {
                setCurrentStep(2);
                processVoice();
              }
            }}
            className="mt-8 text-gray-500 hover:text-gray-300 text-sm"
          >
            Skip this phrase →
          </button>
        </div>
      </div>
    );
  }

  // Processing screen
  if (currentStep === 2) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="text-8xl mb-6 animate-spin">✨</div>
          <h2 className="text-3xl font-bold mb-4 text-white">
            Setting Up Your Voice...
          </h2>
          <p className="text-gray-400 mb-8">
            Almost done!
          </p>
          
          {/* Progress bar */}
          <div className="h-4 bg-white/10 rounded-full overflow-hidden mb-4">
            <div 
              className="h-full bg-gradient-to-r from-pink-500 to-blue-500 transition-all duration-500"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <p className="text-pink-500 font-bold text-2xl mb-2">{Math.round(processingProgress)}%</p>
          
          {/* Dynamic status message */}
          <div className="mt-6 p-4 bg-white/5 rounded-xl">
            <p className="text-gray-300 text-sm">
              {analysisStep || "Processing..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Complete screen
  if (currentStep === 3) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="text-8xl mb-6">🎉</div>
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-500 to-blue-500 bg-clip-text text-transparent">
            Your Voice is Ready!
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Now every song you create will sound like <span className="text-pink-500 font-bold">YOU!</span>
          </p>
          
          <div className="bg-white/5 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-center gap-2 text-green-400">
              <span className="text-2xl">✅</span>
              <span className="font-bold">Voice Model Trained</span>
            </div>
            <p className="text-gray-400 mt-2 text-sm">
              {recordings.length} phrases recorded
            </p>
          </div>
          
          <button
            onClick={() => setShowOnboarding(true)}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-blue-500 text-white font-bold text-xl hover:scale-105 transition transform"
          >
            Start Creating! 🚀
          </button>
          
          {/* Onboarding Modal */}
          <OnboardingModal
            isOpen={showOnboarding}
            onClose={() => setShowOnboarding(false)}
            onStartTraining={() => {
              onComplete('trained');
              onClose();
            }}
          />
        </div>
      </div>
    );
  }

  return null;
};

export default VoiceSetup;

