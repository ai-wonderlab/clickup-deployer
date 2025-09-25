import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  const touchTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'el-GR'; // Greek

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Store the accumulated transcript
        if (finalTranscript) {
          transcriptRef.current += finalTranscript;
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setHasPermission(false);
        }
        stopRecording();
      };

      recognitionRef.current.onend = () => {
        stopRecording();
      };

      // Check for permission
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => setHasPermission(true))
        .catch(() => setHasPermission(false));
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startRecording = () => {
    if (!recognitionRef.current || disabled) return;
    
    // Clear previous transcript
    transcriptRef.current = '';
    
    try {
      recognitionRef.current.start();
      setIsRecording(true);
      
      // Haptic feedback on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = () => {
    if (!recognitionRef.current) return;
    
    try {
      recognitionRef.current.stop();
      setIsRecording(false);
      
      // Send the transcript
      const finalTranscript = transcriptRef.current.trim();
      if (finalTranscript) {
        onTranscript(finalTranscript);
        
        // Haptic feedback
        if ('vibrate' in navigator) {
          navigator.vibrate(30);
        }
      }
      
      // Clear transcript
      transcriptRef.current = '';
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  // Mouse events for desktop
  const handleMouseDown = () => {
    startRecording();
  };

  const handleMouseUp = () => {
    stopRecording();
  };

  const handleMouseLeave = () => {
    if (isRecording) {
      stopRecording();
    }
  };

  // Touch events for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    
    // Start recording after a small delay to prevent accidental taps
    touchTimerRef.current = setTimeout(() => {
      startRecording();
    }, 100);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    
    // Clear the timer if it hasn't fired yet
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
    
    if (isRecording) {
      stopRecording();
    }
  };

  const handleTouchCancel = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
    
    if (isRecording) {
      stopRecording();
    }
  };

  if (!hasPermission) {
    return (
      <button
        onClick={() => {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => setHasPermission(true))
            .catch(() => alert('Microphone permission needed'));
        }}
        className="p-2 rounded-full bg-gray-200 text-gray-400"
        title="Enable microphone"
      >
        <MicOff className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      disabled={disabled}
      className={`
        p-2 rounded-full transition-all touch-none select-none
        ${isRecording 
          ? 'bg-red-500 text-white scale-110 animate-pulse' 
          : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <Mic className="w-5 h-5" />
    </button>
  );
};

export default VoiceInput;