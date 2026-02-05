import React, { useState, useRef } from 'react';

interface JudgeScore {
  pitch: number;
  timing: number;
  emotion: number;
  overall: number;
  feedback: string;
  goldenTicket: boolean;
}

const JudgeMode: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [score, setScore] = useState<JudgeScore | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setScore(null);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const analyzePerformance = async () => {
    if (!audioBlob) return;
    
    setIsAnalyzing(true);
    
    // Simulate AI analysis (in production, send to backend)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate realistic scores based on recording length
    const baseScore = Math.min(recordingTime * 2, 60) + 30;
    const variance = () => Math.floor(Math.random() * 15) - 7;
    
    const pitch = Math.min(100, Math.max(50, baseScore + variance()));
    const timing = Math.min(100, Math.max(50, baseScore + variance()));
    const emotion = Math.min(100, Math.max(50, baseScore + variance()));
    const overall = Math.round((pitch + timing + emotion) / 3);
    const goldenTicket = overall >= 90;
    
    const feedbackOptions = {
      low: [
        "Keep practicing! Your voice has potential, but needs more control.",
        "I hear something there, but you need to work on your breath support.",
        "Not quite ready for the big stage yet, but don't give up!",
      ],
      medium: [
        "Good performance! You've got talent, keep developing it.",
        "I can see you've been working hard. You're getting closer!",
        "Nice job! A few more weeks of practice and you'll be ready.",
      ],
      high: [
        "Wow! That was incredible! You've got star quality!",
        "I'm blown away! You're ready for the spotlight!",
        "Golden Ticket worthy! You're going to Hollywood!",
      ],
    };
    
    let feedbackArray;
    if (overall < 70) feedbackArray = feedbackOptions.low;
    else if (overall < 90) feedbackArray = feedbackOptions.medium;
    else feedbackArray = feedbackOptions.high;
    
    const feedback = feedbackArray[Math.floor(Math.random() * feedbackArray.length)];
    
    setScore({ pitch, timing, emotion, overall, feedback, goldenTicket });
    setIsAnalyzing(false);
  };

  const resetJudge = () => {
    setAudioBlob(null);
    setScore(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const ScoreBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-bold">{value}%</span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-1000`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
          ⚖️ The Judge
        </h1>
        <p className="text-gray-300">
          Perform your best and get scored like you're on America's Got Talent!
        </p>
      </div>

      {/* Recording Section */}
      {!score && (
        <div className="bg-black/40 backdrop-blur-md rounded-2xl p-8 border border-yellow-500/30 mb-8">
          <div className="text-center">
            {!audioBlob ? (
              <>
                <p className="text-gray-400 mb-6">
                  {isRecording ? 'Sing your heart out!' : 'Press the button and perform your best!'}
                </p>
                
                {/* Record Button */}
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-32 h-32 rounded-full transition-all transform ${
                    isRecording
                      ? 'bg-red-500 scale-110 animate-pulse'
                      : 'bg-gradient-to-br from-yellow-400 to-orange-500 hover:scale-105'
                  } shadow-lg`}
                >
                  <span className="text-4xl">{isRecording ? '⏹️' : '🎤'}</span>
                </button>
                
                {isRecording && (
                  <div className="mt-4">
                    <p className="text-3xl font-mono text-yellow-400">{formatTime(recordingTime)}</p>
                    <p className="text-sm text-gray-400 animate-pulse">Recording...</p>
                  </div>
                )}
                
                {!isRecording && (
                  <p className="mt-4 text-sm text-gray-500">
                    Sing for at least 15 seconds for best results
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-green-400 mb-4">✅ Recording captured! ({formatTime(recordingTime)})</p>
                
                <audio 
                  controls 
                  src={URL.createObjectURL(audioBlob)}
                  className="w-full max-w-md mx-auto mb-6"
                />
                
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={resetJudge}
                    className="px-6 py-3 rounded-xl bg-gray-700 text-white hover:bg-gray-600 transition"
                  >
                    🔄 Try Again
                  </button>
                  <button
                    onClick={analyzePerformance}
                    disabled={isAnalyzing}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-bold hover:scale-105 transition transform disabled:opacity-50"
                  >
                    {isAnalyzing ? '🎯 Judging...' : '⚖️ Get Judged!'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Analyzing Animation */}
      {isAnalyzing && (
        <div className="bg-black/40 backdrop-blur-md rounded-2xl p-8 border border-yellow-500/30 text-center">
          <div className="text-6xl animate-bounce mb-4">🎯</div>
          <h2 className="text-2xl font-bold text-yellow-400 mb-2">The Judges are deliberating...</h2>
          <p className="text-gray-400">Analyzing your pitch, timing, and emotion</p>
          <div className="flex justify-center gap-2 mt-4">
            <span className="text-3xl animate-pulse">⭐</span>
            <span className="text-3xl animate-pulse">⭐</span>
            <span className="text-3xl animate-pulse">⭐</span>
          </div>
        </div>
      )}

      {/* Score Results */}
      {score && !isAnalyzing && (
        <div className="space-y-6">
          {/* Golden Ticket Banner */}
          {score.goldenTicket && (
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl p-6 text-center animate-pulse">
              <div className="text-6xl mb-2">🎫</div>
              <h2 className="text-3xl font-bold text-black">GOLDEN TICKET!</h2>
              <p className="text-black/80">You're going to Hollywood!</p>
            </div>
          )}

          {/* Score Card */}
          <div className="bg-black/40 backdrop-blur-md rounded-2xl p-8 border border-yellow-500/30">
            <h2 className="text-2xl font-bold text-center text-yellow-400 mb-6">Your Scores</h2>
            
            <ScoreBar label="🎵 Pitch Accuracy" value={score.pitch} color="bg-blue-500" />
            <ScoreBar label="⏱️ Timing & Rhythm" value={score.timing} color="bg-green-500" />
            <ScoreBar label="💖 Emotion & Expression" value={score.emotion} color="bg-pink-500" />
            
            <div className="mt-6 pt-6 border-t border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-xl text-gray-300">Overall Score</span>
                <span className={`text-4xl font-bold ${
                  score.overall >= 90 ? 'text-yellow-400' : 
                  score.overall >= 70 ? 'text-green-400' : 'text-orange-400'
                }`}>
                  {score.overall}%
                </span>
              </div>
            </div>
          </div>

          {/* Feedback */}
          <div className="bg-black/40 backdrop-blur-md rounded-2xl p-8 border border-yellow-500/30">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">🎤 Judge's Feedback</h3>
            <p className="text-xl text-gray-200 italic">"{score.feedback}"</p>
          </div>

          {/* Try Again */}
          <div className="text-center">
            <button
              onClick={resetJudge}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-bold text-xl hover:scale-105 transition transform"
            >
              🎤 Perform Again
            </button>
          </div>
        </div>
      )}

      {/* Tips Section */}
      {!isRecording && !audioBlob && !score && (
        <div className="bg-black/20 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-yellow-400 mb-4">💡 Performance Tips</h3>
          <ul className="space-y-2 text-gray-400">
            <li>🎵 Sing in a quiet environment for best results</li>
            <li>⏱️ Perform for at least 15-30 seconds</li>
            <li>💖 Put emotion into your performance</li>
            <li>🎤 Hold your device close like a microphone</li>
            <li>⭐ Aim for 95%+ to earn your Golden Ticket!</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default JudgeMode;
