import { useState, useEffect, useRef, useCallback } from 'react';
import { ai, ANAZ_SYSTEM_INSTRUCTION, openWebsiteTool, searchTool, getDateTimeTool, playMusicTool, sendWhatsAppMessageTool, initiateCallTool } from '../lib/gemini';
import { Modality } from '@google/genai';

export function useGeminiLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string>("");
  const [ambiTextResponse, setAmbiTextResponse] = useState<string>("");
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<any>(null);
  const connectingRef = useRef(false);
  const isAwakeRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const lastIncomingMessageRef = useRef<{name: string, chatId: string} | null>(null);

  const isLocal = window.location.hostname === 'localhost';

  const stopAudio = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const playNextChunk = useCallback(() => {
    if (!audioContextRef.current || playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = playbackQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, chunk.length, 24000);
    buffer.getChannelData(0).set(chunk);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);

    const startTime = Math.max(audioContextRef.current.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    source.onended = () => {
      playNextChunk();
    };
  }, []);

  const handleToolCall = useCallback(async (toolCall: any) => {
    const responses = [];
    for (const call of toolCall.functionCalls) {
      const { name, args, id } = call;
      let result: any = {};

      try {
        if (name === "openWebsite") {
          window.open(args.url, '_blank');
          result = { success: true, message: `Opened ${args.url}` };
        } else if (name === "search") {
          window.open(`https://www.google.com/search?q=${encodeURIComponent(args.query)}`, '_blank');
          result = { success: true, message: `Searching for ${args.query}` };
        } else if (name === "getDateTime") {
          const options: Intl.DateTimeFormatOptions = {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          };
          result = { dateTime: new Intl.DateTimeFormat('en-US', options).format(new Date()), timezone: 'Asia/Kolkata' };
        } else if (name === "playMusic") {
          // Play music logic remains the same (tries relative API first)
          const getVideoId = async (query: string): Promise<string | null> => {
            try {
              const backendUrl = isLocal ? '' : 'https://ambi-ai.onrender.com';
              const res = await fetch(`${backendUrl}/api/youtube-search?q=${encodeURIComponent(query)}`);
              if (res.ok) {
                const data = await res.json();
                return data.videoId;
              }
            } catch { return null; }
            return null;
          };

          const videoId = await getVideoId(args.query);
          if (videoId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
            result = { success: true, message: `Playing ${args.query}` };
          } else {
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`, '_blank');
            result = { success: true, message: `Searching YouTube for ${args.query}` };
          }
        } else if (name === "sendWhatsAppMessage") {
          if (!isLocal) {
            result = { success: false, message: 'WhatsApp integration is only available when running locally.' };
          } else {
            try {
              const botResponse = await fetch('http://localhost:4000/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: args.name || 'Unknown', message: args.message }),
              });
              result = await botResponse.json();
            } catch {
              result = { success: false, message: 'Local WhatsApp bot is not running.' };
            }
          }
        }
      } catch (err) {
        result = { error: "Failed to execute tool" };
      }
      responses.push({ id, name, response: result });
    }
    sessionRef.current?.sendToolResponse({ functionResponses: responses });
  }, [isLocal]);

  const connect = useCallback(async () => {
    if (connectingRef.current || isConnected) return;
    connectingRef.current = true;
    try {
      const session = await ai.live.connect({
        model: "gemini-2.0-flash-exp",
        config: {
          systemInstruction: ANAZ_SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          tools: [{ functionDeclarations: [openWebsiteTool, searchTool, getDateTimeTool, playMusicTool, sendWhatsAppMessageTool, initiateCallTool] }],
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setError(null);
            console.log("Connected to Gemini Live");
          },
          onclose: (event: any) => {
            setIsConnected(false);
            stopAudio();
            console.log("Disconnected from Gemini Live. Reason:", event?.reason || "No reason provided", "Code:", event?.code);
          },
          onerror: (err: any) => {
            console.error("Gemini Live Connection Error:", err);
            setError(`Error: ${err.message || "Connection failed"}`);
          },
          onmessage: (message: any) => {
            if (message.inputAudioTranscription?.text) {
              const text = message.inputAudioTranscription.text.toLowerCase();
              setLastTranscription(message.inputAudioTranscription.text);
              if (text.includes("ambi")) { 
                isAwakeRef.current = true; 
                setIsAwake(true); 
              }
            }
            if (message.serverContent?.modelTurn?.parts && isAwakeRef.current) {
              let textChunk = "";
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) textChunk += part.text;
                if (part.inlineData?.data) {
                  const binary = atob(part.inlineData.data);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                  const pcm16 = new Int16Array(bytes.buffer);
                  const float32 = new Float32Array(pcm16.length);
                  for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
                  playbackQueueRef.current.push(float32);
                  if (!isPlayingRef.current) playNextChunk();
                }
              }
              if (textChunk) setAmbiTextResponse(prev => prev + textChunk);
            }
            if (message.toolCall) handleToolCall(message.toolCall);
          }
        }
      });
      sessionRef.current = session;
    } catch (err: any) {
      console.error("Failed to connect:", err);
      setError(`Failed to connect: ${err.message || "Check your API key"}`);
    } finally {
      connectingRef.current = false;
    }
  }, [handleToolCall, playNextChunk, stopAudio, isConnected]);

  const startRecording = useCallback(async () => {
    if (!isConnected || !sessionRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolume(Math.sqrt(sum / inputData.length));
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }
        try {
          if (sessionRef.current && isConnected) {
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
            sessionRef.current.sendRealtimeInput({
              audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        } catch (err) { console.error("Error sending audio input:", err); }
      };
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      setIsRecording(true);
    } catch (err) { setError("Microphone access denied."); }
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || !isLocal) return;
    const eventSource = new EventSource('http://localhost:4000/stream');
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.name && data.message && sessionRef.current) {
        sessionRef.current.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `[SYSTEM] Message from ${data.name}: ${data.message}` }] }], turnComplete: true } });
        isAwakeRef.current = true; setIsAwake(true);
      }
    };
    return () => eventSource.close();
  }, [isConnected, isLocal]);

  return { 
    isConnected, 
    isRecording, 
    isAwake, 
    lastTranscription, 
    ambiTextResponse, 
    volume, 
    error, 
    connect, 
    disconnect: () => { stopAudio(); sessionRef.current?.close(); setIsConnected(false); }, 
    startRecording, 
    stopRecording: stopAudio, 
    sendVideoFrame: () => {}, 
    sendText: () => {}, 
    setAmbiTextResponse, 
    toggleAwake: () => { isAwakeRef.current = !isAwakeRef.current; setIsAwake(isAwakeRef.current); } 
  };
}
