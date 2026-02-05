
import React, { useState, useEffect } from 'react';
import { generateSongFromAudio } from '../services/claudeService';
import { generateTrackAudio, generateClonedTrack } from '../services/musicGenService';
import { SongResult } from '../types';
import AudioRecorder from './AudioRecorder';
import VoiceSetup from './VoiceSetup';

interface SongWriterModeProps {
  onComplete?: () => void;
}

// Helper to render lyrics with structure highlighting
const renderStructuredLyrics = (rawLyrics: string) => {
  const parts = rawLyrics.split(/(\[.*?\])/).filter(p => p.trim());
  const blocks = [];
  
  for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('[') && part.endsWith(']')) {
          const header = part.replace(/[\[\]]/g, '');
          const content = parts[i+1] && !parts[i+1].startsWith('[') ? parts[i+1] : '';
          if (content) i++;
          blocks.push({ header, content });
      } else {
          blocks.push({ header: '', content: part });
      }
  }

  return (
      <div className="space-y-12 flex flex-col items-center w-full animate-fade-in-up">
          {blocks.map((block, idx) => {
              const type = block.header.toLowerCase();
              let borderColor = "border-gray-800";
              let textColor = "text-gray-300";
              let badgeClass = "bg-gray-800 text-gray-400";
              let containerBg = "bg-black/80";
              
              if (type.includes('chorus')) {
                  borderColor = "border-neonPink/60";
                  textColor = "text-white font-medium";
                  badgeClass = "bg-neonPink text-black font-bold shadow-[0_0_15px_rgba(255,0,255,0.6)]";
                  containerBg = "bg-black/90 border-neonPink/30"; 
              } else if (type.includes('verse')) {
                  borderColor = "border-neonBlue/40";
                  textColor = "text-gray-200";
                  badgeClass = "bg-neonBlue/20 text-neonBlue border border-neonBlue/30 font-bold";
                  containerBg = "bg-black/80";
              } else if (type.includes('bridge')) {
                  borderColor = "border-purple-500/60";
                  textColor = "text-purple-100 italic";
                  badgeClass = "bg-purple-600 text-white font-bold shadow-[0_0_15px_rgba(147,51,234,0.5)]";
                  containerBg = "bg-purple-900/40";
              } else if (type.includes('outro') || type.includes('intro')) {
                  borderColor = "border-white/20";
                  textColor = "text-gray-400";
                  badgeClass = "bg-white/10 text-gray-300 border border-white/10 font-bold";
                  containerBg = "bg-black/80";
              }

              return (
                  <div key={idx} className={`w-full max-w-3xl p-8 md:p-10 rounded-3xl border ${borderColor} ${containerBg} backdrop-blur-md relative group transition-all duration-300 hover:scale-[1.02] text-center shadow-2xl`}>
                      {block.header && (
                         <span className={`absolute -top-3 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full text-xs uppercase tracking-widest ${badgeClass} z-10`}>
                             {block.header}
                         </span>
                      )}
                      <p className={`whitespace-pre-wrap font-serif text-2xl md:text-4xl leading-relaxed text-center ${textColor} ${block.header ? 'mt-4' : ''}`}>
                          {block.content.trim()}
                      </p>
                  </div>
              );
          })}
      </div>
  );
};

const SongWriterMode: React.FC<SongWriterModeProps> = ({ onComplete }) => {
  const [result, setResult] = useState<SongResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  
  // Voice Setup State
  const [showVoiceSetup, setShowVoiceSetup] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  
  // Check if voice is already set up
  useEffect(() => {
    const isSetup = localStorage.getItem('starprep_voice_setup_complete') === 'true';
    setVoiceReady(isSetup);
  }, []);
  
  // Input Method State
  const [inputMethod, setInputMethod] = useState<'RECORD' | 'UPLOAD'>('RECORD');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  // Audio Generation State
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [useVoiceClone, setUseVoiceClone] = useState(false);
  
  // Voice Cloning Specific State
  const [selectedVoiceModel, setSelectedVoiceModel] = useState<string>('Studio Pop (Male)');
  const [referenceMethod, setReferenceMethod] = useState<'ORIGINAL' | 'UPLOAD'>('ORIGINAL');
  const [customReferenceFile, setCustomReferenceFile] = useState<File | null>(null);
  const [vocalGender, setVocalGender] = useState<'m' | 'f'>('f'); // Male or Female AI vocals

  const voiceModels = [
    { id: 'Studio Pop (Male)', label: 'Studio Pop (Male)' },
    { id: 'Studio Pop (Female)', label: 'Studio Pop (Female)' },
    { id: 'R&B Soul', label: 'R&B Soul' },
    { id: 'Future Bass (Robot)', label: 'Future Bass (Robot)' },
  ];

  const handleRecordingComplete = async (blob: Blob) => {
    setAudioBlob(blob);
    await processAudio(blob);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
    }
  };

  const processUploadedFile = async () => {
    if (!uploadedFile) return;
    setLoading(true);
    const blob = new Blob([uploadedFile], { type: uploadedFile.type });
    setAudioBlob(blob);
    await processAudio(blob);
  };

  const processAudio = async (blob: Blob) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setGeneratedAudioUrl(null);
    setAudioError(null);
    
    setAnalysisStep('Listening to your 4 words...');
    
    try {
      setTimeout(() => setAnalysisStep('Extracting Vocal DNA & Timbre...'), 1500);
      setTimeout(() => setAnalysisStep('Detecting Musical Style & Genre...'), 3000);
      setTimeout(() => setAnalysisStep('Composing Full Hit Song...'), 4500);
      setTimeout(() => setAnalysisStep('Generating Audio Track...'), 6000);

      const data = await generateSongFromAudio(blob);
      setResult(data);
      
      // Don't auto-use backend audio - let user choose gender first
      // if (data.audioUrl) {
      //   console.log('✅ Using audio from backend:', data.audioUrl);
      //   setGeneratedAudioUrl(data.audioUrl);
      // }
      
      if (onComplete) onComplete();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create song. Please try singing clearly or check your file format.");
    } finally {
      setLoading(false);
      setAnalysisStep('');
    }
  };

  const handleGenerateAudio = async () => {
    if (!result) return;
    setAudioLoading(true);
    setAudioError(null);
    
    try {
      let url: string;
      
      if (useVoiceClone) {
        if (referenceMethod === 'UPLOAD') {
           if (!customReferenceFile) {
             setAudioError("Please upload a custom voice sample to proceed with cloning.");
             setAudioLoading(false);
             return;
           }
           // Pass the result with audioUrl so it can be used as base
           const songWithAudio = { ...result, audioUrl: generatedAudioUrl || result.audioUrl };
           // FIXED: Now passing gender to generateClonedTrack
           url = await generateClonedTrack(songWithAudio, customReferenceFile, selectedVoiceModel, setAnalysisStep, vocalGender);
        } else {
           if (!audioBlob) {
             setAudioError("Original recording not found. Please try uploading a sample instead.");
             setAudioLoading(false);
             return;
           }
           // Pass the result with audioUrl so it can be used as base
           const songWithAudio = { ...result, audioUrl: generatedAudioUrl || result.audioUrl };
           // FIXED: Now passing gender to generateClonedTrack
           url = await generateClonedTrack(songWithAudio, audioBlob, selectedVoiceModel, setAnalysisStep, vocalGender);
        }
      } else {
        // Always generate with selected vocal gender
        setAnalysisStep(`Generating ${vocalGender === 'm' ? 'male' : 'female'} vocals...`);
        url = await generateTrackAudio(result, setAnalysisStep, vocalGender);
      }
      
      console.log('Audio URL generated:', url);
      setGeneratedAudioUrl(url);
      
      // Verify the audio URL is valid
      if (!url || url === '') {
        throw new Error('Empty audio URL returned');
      }
      
    } catch (err: any) {
      console.error("Audio generation failed:", err);
      setAudioError(err?.message || "Failed to generate audio. Please check your API keys and try again.");
    } finally {
      setAudioLoading(false);
    }
  };

  const saveSong = () => {
    if (!result) return;
    const content = `TITLE: ${result.title}\nGENRE: ${result.genre}\nVOCAL STYLE: ${result.vocalAnalysis || 'N/A'}\n\n[CHORDS]\n${result.chords}\n\n[STRUCTURE]\n${result.structure}\n\n[LYRICS]\n${result.lyrics}`;
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${result.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="max-w-5xl mx-auto w-full p-6 animate-fade-in-up">
      {/* Voice Setup Modal */}
      {showVoiceSetup && (
        <VoiceSetup 
          onComplete={(voiceId) => {
            console.log('Voice setup complete:', voiceId);
            setVoiceReady(true);
          }}
          onClose={() => setShowVoiceSetup(false)}
        />
      )}
      
      <div className="text-center mb-10">
        {/* Setup Voice Button - Top Right */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowVoiceSetup(true)}
            className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2 ${
              voiceReady 
                ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                : 'bg-neonPink/20 text-neonPink border border-neonPink/50 hover:bg-neonPink/30'
            }`}
          >
            {voiceReady ? (
              <>✅ Voice Ready</>
            ) : (
              <>🎤 Setup My Voice</>
            )}
          </button>
        </div>
        
        <h2 className="text-4xl md:text-5xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-neonPink to-purple-400 mb-4">
          Song Writer
        </h2>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Sing just 4 words and our AI will compose a complete song with lyrics, melody suggestions, and structure.
        </p>
      </div>

      {/* Input Method Selector */}
      {!result && !loading && (
        <div className="mb-8 flex justify-center gap-4">
          <button
            onClick={() => setInputMethod('RECORD')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              inputMethod === 'RECORD'
                ? 'bg-neonPink text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            🎤 Record Live
          </button>
          <button
            onClick={() => setInputMethod('UPLOAD')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              inputMethod === 'UPLOAD'
                ? 'bg-neonPink text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            📁 Upload File
          </button>
        </div>
      )}

      {/* Recording/Upload UI */}
      {!result && !loading && (
        <div className="glass-panel p-10 rounded-3xl flex flex-col items-center justify-center min-h-[400px]">
          {inputMethod === 'RECORD' ? (
            <AudioRecorder 
              onRecordingComplete={handleRecordingComplete} 
              isProcessing={loading} 
              label="Sing 4 words to create your song" 
            />
          ) : (
            <div className="w-full max-w-md space-y-4">
              <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center hover:border-neonPink transition">
                <label className="cursor-pointer block">
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.webm"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="space-y-2">
                    <div className="text-4xl">📁</div>
                    <p className="text-sm text-gray-400">
                      {uploadedFile ? uploadedFile.name : 'Click to upload audio file'}
                    </p>
                    <p className="text-xs text-gray-500">MP3, WAV, M4A, or WEBM</p>
                  </div>
                </label>
              </div>
              {uploadedFile && (
                <button
                  onClick={processUploadedFile}
                  className="w-full py-3 bg-neonPink text-black rounded-lg font-bold hover:bg-pink-400 transition"
                >
                  Process Audio File
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="mt-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center min-h-[400px] space-y-8">
          <div className="relative w-32 h-32">
            <div className="absolute inset-0 border-4 border-neonPink/30 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-neonPink rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-4xl">
              🎵
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-xl text-neonPink font-bold animate-pulse">{analysisStep}</p>
            <p className="text-sm text-gray-400">This may take 15-30 seconds...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-12">
          {/* Song Header */}
          <div className="text-center space-y-2 animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-gold to-yellow-300">
              {result.title}
            </h1>
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="px-3 py-1 bg-neonPink/20 text-neonPink rounded-full border border-neonPink/30 font-semibold">
                {result.genre}
              </span>
              {result.vocalAnalysis && (
                <span className="px-3 py-1 bg-neonBlue/20 text-neonBlue rounded-full border border-neonBlue/30 font-semibold">
                  {result.vocalAnalysis}
                </span>
              )}
            </div>
          </div>

          {/* Audio Generation Panel */}
          <div className="glass-panel p-8 rounded-2xl border-2 border-neonPink/30 max-w-2xl mx-auto">
                <h3 className="text-xl font-bold text-white mb-4 text-center">🎧 Generate Full Track</h3>
                
                {!generatedAudioUrl ? (
                   <div className="space-y-4">
                     {/* Voice Gender Selector */}
                     <div className="p-4 bg-black/40 rounded-lg">
                       <label className="block text-xs font-bold text-gray-400 mb-3 uppercase">AI Vocalist</label>
                       <div className="flex gap-3">
                         <button
                           onClick={() => setVocalGender('f')}
                           className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 transition ${
                             vocalGender === 'f' 
                               ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold' 
                               : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                           }`}
                         >
                           <span className="text-xl">👩‍🎤</span>
                           <span>Female</span>
                         </button>
                         <button
                           onClick={() => setVocalGender('m')}
                           className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 transition ${
                             vocalGender === 'm' 
                               ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold' 
                               : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                           }`}
                         >
                           <span className="text-xl">👨‍🎤</span>
                           <span>Male</span>
                         </button>
                       </div>
                     </div>

                     {/* Voice Clone Toggle */}
                     <div className="flex items-center justify-between p-4 bg-black/40 rounded-lg">
                       <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${useVoiceClone ? 'bg-neonPink/20 text-neonPink' : 'bg-white/10 text-white'}`}>
                            {useVoiceClone ? '🎤' : '🎹'}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-white">
                              {useVoiceClone ? 'Voice Clone Mode' : 'Standard Production'}
                            </p>
                            <p className="text-xs text-gray-400">
                              {useVoiceClone ? 'AI learns your voice' : 'AI vocalist sings for you'}
                            </p>
                          </div>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useVoiceClone}
                            onChange={(e) => setUseVoiceClone(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neonPink"></div>
                       </label>
                     </div>

                     {useVoiceClone && (
                       <div className="mt-4 border-t border-gray-700 pt-3 animate-fade-in">
                         <div className="mb-4">
                           <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Reference Voice</label>
                           <div className="flex gap-2 mb-2">
                              <button
                                onClick={() => setReferenceMethod('ORIGINAL')}
                                className={`flex-1 py-1.5 text-xs rounded border transition ${referenceMethod === 'ORIGINAL' ? 'bg-white/20 border-white text-white' : 'border-gray-700 text-gray-500 hover:bg-white/5'}`}
                              >
                                Use Input
                              </button>
                              <button
                                onClick={() => setReferenceMethod('UPLOAD')}
                                className={`flex-1 py-1.5 text-xs rounded border transition ${referenceMethod === 'UPLOAD' ? 'bg-white/20 border-white text-white' : 'border-gray-700 text-gray-500 hover:bg-white/5'}`}
                              >
                                Upload Sample
                              </button>
                           </div>
                           
                           {referenceMethod === 'UPLOAD' && (
                             <div className="space-y-2">
                                <label className="flex items-center justify-center w-full h-16 border border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-white/5 transition">
                                    <div className="text-center w-full px-2">
                                      {customReferenceFile ? (
                                          <div className="flex items-center justify-center gap-2 overflow-hidden">
                                            <div className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex-shrink-0 flex items-center justify-center">
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                            <p className="text-xs text-green-400 font-bold truncate max-w-[150px]">
                                              {customReferenceFile.name}
                                            </p>
                                          </div>
                                      ) : (
                                          <p className="text-[10px] text-gray-400">Click to upload custom voice sample</p>
                                      )}
                                    </div>
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept=".mp3,.wav,.m4a,audio/*" 
                                      onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            setCustomReferenceFile(e.target.files[0]);
                                        }
                                      }} 
                                    />
                                </label>
                             </div>
                           )}
                         </div>

                         <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Target Style</label>
                         <div className="relative">
                            <select
                              value={selectedVoiceModel}
                              onChange={(e) => setSelectedVoiceModel(e.target.value)}
                              className="w-full bg-black/40 border border-gray-600 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neonPink appearance-none cursor-pointer"
                            >
                              {voiceModels.map((model) => (
                                <option key={model.id} value={model.id} className="bg-gray-900 text-white">
                                  {model.label}
                                </option>
                              ))}
                            </select>
                         </div>
                       </div>
                     )}

                     {audioError && (
                       <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                         <p className="text-red-400 text-xs">{audioError}</p>
                       </div>
                     )}

                     <button 
                       onClick={handleGenerateAudio}
                       disabled={audioLoading}
                       className={`w-full py-3 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2
                         ${audioLoading ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-neonPink text-black hover:bg-pink-400'}
                       `}
                     >
                       {audioLoading ? (
                         <>
                           <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                           {useVoiceClone ? 'Cloning & Generating...' : 'Producing Track...'}
                         </>
                       ) : (
                         useVoiceClone ? '✨ Generate Cloned Track' : '🎹 Produce Standard Track'
                       )}
                     </button>
                   </div>
                ) : (
                  <div className="space-y-3 animate-fade-in relative z-10">
                    <p className="text-xs text-green-400 font-bold uppercase tracking-wide flex justify-between items-center">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                        Track Ready
                      </span>
                      {useVoiceClone && <span className="text-neonPink">🎤 AI Voice Cloned</span>}
                    </p>
                    <audio 
                      controls 
                      className="w-full h-12 rounded-lg" 
                      src={generatedAudioUrl}
                      preload="auto"
                      onError={(e) => {
                        console.error('Audio playback error:', e);
                        setAudioError('Failed to load audio. The URL may be invalid.');
                      }}
                      onLoadedData={() => {
                        console.log('Audio loaded successfully');
                      }}
                    >
                      Your browser does not support the audio element.
                    </audio>
                    <button 
                       onClick={() => {
                         setGeneratedAudioUrl(null);
                         setAudioError(null);
                       }}
                       className="text-xs text-gray-500 hover:text-white underline w-full text-center transition"
                    >
                      🔄 Generate New Version
                    </button>
                  </div>
                )}
           </div>

           {/* Lyrics Column */}
           <div className="w-full flex flex-col items-center">
              <h3 className="text-xl font-bold text-gray-200 border-b border-gray-800 pb-2 mb-8 flex items-center justify-center gap-2 uppercase tracking-widest w-full max-w-xs">
                 <span>📝</span> Lyrics & Structure
              </h3>
              {renderStructuredLyrics(result.lyrics)}
           </div>
           
           {/* Footer Actions */}
           <div className="w-full max-w-lg space-y-4 mx-auto">
              <div className="bg-black/60 backdrop-blur-md p-6 rounded-xl border border-gray-800 text-center">
                <h3 className="text-lg font-bold text-gold mb-3">📋 Composition Notes</h3>
                <div className="space-y-4">
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Structure</span>
                    <p className="text-sm text-gray-300">{result.structure}</p>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Chords</span>
                    <p className="text-lg text-neonBlue font-mono">{result.chords}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4">
                  <button 
                    onClick={saveSong}
                    className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition border border-white/20 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    💾 Save Song File
                  </button>
                  <button 
                    onClick={() => {
                      setResult(null);
                      setUploadedFile(null);
                      setAudioBlob(null);
                      setGeneratedAudioUrl(null);
                      setCustomReferenceFile(null);
                      setAudioError(null);
                      setError(null);
                    }}
                    className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-600 transition text-white font-semibold"
                  >
                    🎵 New Song
                  </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default SongWriterMode;
