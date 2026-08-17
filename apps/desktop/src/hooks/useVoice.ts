import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useVoice() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const Recognition =
    window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  const supported = Recognition !== null;

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(
    (onTranscript: (text: string, isFinal: boolean) => void) => {
      if (!Recognition) {
        setVoiceError("Voice input is unavailable on this version of macOS.");
        return;
      }

      stopListening();
      setVoiceError(null);
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        let transcript = "";
        let final = false;
        for (let index = 0; index < event.results.length; index += 1) {
          transcript += event.results[index][0].transcript;
          final ||= event.results[index].isFinal;
        }
        onTranscript(transcript.trim(), final);
      };
      recognition.onerror = (event) => {
        const message =
          event.error === "not-allowed"
            ? "Microphone access was denied. You can enable it in System Settings."
            : `Voice input stopped: ${event.error}.`;
        setVoiceError(message);
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    },
    [Recognition, stopListening],
  );

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.lang = navigator.language || "en-US";
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  return {
    isListening,
    speak,
    startListening,
    stopListening,
    supported,
    voiceError,
  };
}
