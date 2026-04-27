import { useState, useEffect, useRef, useCallback } from 'react';
import { ai, ANAZ_SYSTEM_INSTRUCTION, openWebsiteTool, searchTool, getDateTimeTool, playMusicTool, sendWhatsAppMessageTool, sendTelegramMessageTool, initiateCallTool } from '../lib/gemini';
import { Modality } from '@google/genai';

export function useGeminiLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAwake, setIsAwake] = useState(true);
  const [lastTranscription, setLastTranscription] = useState<string>("");
  const [ambiTextResponse, setAmbiTextResponse] = useState<string>("");
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<any>(null);
  const connectingRef = useRef(false);
  const isAwakeRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const lastIncomingMessageRef = useRef<{name: string, chatId: string} | null>(null);

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

          if (args.location) {
            // This is a simplified location-to-timezone mapping.
            // In a real app, you'd use a library or a more robust mapping.
            const tzMap: Record<string, string> = {
              'USA': 'America/New_York',
              'US': 'America/New_York',
              'New York': 'America/New_York',
              'London': 'Europe/London',
              'UK': 'Europe/London',
              'Tokyo': 'Asia/Tokyo',
              'Japan': 'Asia/Tokyo',
              'Dubai': 'Asia/Dubai',
              'UAE': 'Asia/Dubai',
              'Sydney': 'Australia/Sydney',
              'Australia': 'Australia/Sydney',
              'Paris': 'Europe/Paris',
              'France': 'Europe/Paris',
              'Berlin': 'Europe/Berlin',
              'Germany': 'Europe/Berlin',
            };

            const targetTz = tzMap[args.location] || tzMap[args.location.trim()];
            if (targetTz) {
              options.timeZone = targetTz;
              result = { 
                location: args.location,
                dateTime: new Intl.DateTimeFormat('en-US', options).format(new Date()),
                timezone: targetTz
              };
            } else {
              // If location not found in map, try to use it directly as a timezone string
              try {
                options.timeZone = args.location;
                result = { 
                  location: args.location,
                  dateTime: new Intl.DateTimeFormat('en-US', options).format(new Date()),
                  timezone: args.location
                };
              } catch (e) {
                result = { 
                  error: `Could not find timezone for ${args.location}. Defaulting to IST.`,
                  dateTime: new Intl.DateTimeFormat('en-US', options).format(new Date()),
                  timezone: 'Asia/Kolkata'
                };
              }
            }
          } else {
            result = { 
              dateTime: new Intl.DateTimeFormat('en-US', options).format(new Date()),
              timezone: 'Asia/Kolkata'
            };
          }
        } else if (name === "playMusic") {
          // Remove any existing YT overlay
          document.getElementById('yt-overlay')?.remove();

          // ── Search for a YouTube video ID ──
          // Priority: 1) Our server (most reliable, no CORS)  2) Invidious public API  3) YouTube search fallback
          const getVideoId = async (query: string): Promise<string | null> => {
            // 1️⃣ Try our own server (bypasses CORS, best scraping)
            try {
              const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`, {
                signal: AbortSignal.timeout(6000),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.videoId) return data.videoId as string;
              }
            } catch { /* server not running, try Invidious */ }

            // 2️⃣ Try Invidious public instances (CORS-friendly, no API key)
            const instances = [
              'https://invidious.io.lol',
              'https://invidious.privacyredirect.com',
              'https://invidious.nerdvpn.de',
              'https://inv.tux.pizza',
              'https://invidious.privacydev.net',
              'https://invidious.projectsegfau.lt',
            ];
            for (const base of instances) {
              try {
                const res = await fetch(
                  `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId&hl=en`,
                  { signal: AbortSignal.timeout(4000) }
                );
                if (!res.ok) continue;
                const json = await res.json();
                if (Array.isArray(json) && json[0]?.videoId) return json[0].videoId as string;
              } catch { /* try next */ }
            }

            // 3️⃣ Try YouTube oEmbed trick — fetch first result videoId via RSS feed (no CORS)
            try {
              const rssUrl = `https://www.youtube.com/feeds/videos.xml?search=${encodeURIComponent(query)}`;
              const rssRes = await fetch(rssUrl, { signal: AbortSignal.timeout(5000) });
              if (rssRes.ok) {
                const text = await rssRes.text();
                const match = text.match(/yt:videoId>([a-zA-Z0-9_-]{11})</);
                if (match?.[1]) return match[1];
              }
            } catch { /* try nothing left */ }

            return null;
          };

          const videoId = await getVideoId(args.query);

          if (videoId) {
            // ── Build a premium fullscreen overlay ──
            const overlay = document.createElement('div');
            overlay.id = 'yt-overlay';
            overlay.style.cssText = [
              'position:fixed;inset:0;z-index:99999;',
              'background:#000;',
              'display:flex;flex-direction:column;',
            ].join('');

            // Mini top bar
            const bar = document.createElement('div');
            bar.style.cssText = [
              'display:flex;align-items:center;justify-content:space-between;',
              'padding:10px 16px;',
              'background:rgba(0,0,0,0.6);',
              'backdrop-filter:blur(10px);',
              'border-bottom:1px solid rgba(255,255,255,0.08);',
              'flex-shrink:0;',
            ].join('');

            const title = document.createElement('span');
            title.textContent = `▶  ${args.query}`;
            title.style.cssText = 'color:rgba(255,255,255,0.8);font-size:13px;font-family:Outfit,sans-serif;letter-spacing:0.03em;';

            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&#x2715; Close';
            closeBtn.style.cssText = [
              'background:rgba(255,255,255,0.1);color:#fff;',
              'border:1px solid rgba(255,255,255,0.15);',
              'padding:6px 16px;border-radius:999px;cursor:pointer;',
              'font-size:12px;font-family:Outfit,sans-serif;',
              'transition:background 0.2s;',
            ].join('');
            closeBtn.onmouseenter = () => { closeBtn.style.background = 'rgba(255,255,255,0.22)'; };
            closeBtn.onmouseleave = () => { closeBtn.style.background = 'rgba(255,255,255,0.1)'; };
            closeBtn.onclick = () => overlay.remove();

            bar.appendChild(title);
            bar.appendChild(closeBtn);

            // Iframe
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
            iframe.style.cssText = 'width:100%;flex:1;border:none;';
            iframe.allow = 'autoplay; fullscreen; picture-in-picture';
            iframe.allowFullscreen = true;

            overlay.appendChild(bar);
            overlay.appendChild(iframe);
            document.body.appendChild(overlay);
            result = { success: true, message: `Playing ${args.query} on YouTube` };
          } else {
            // Last resort: open YouTube search in new tab
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`, '_blank');
            result = { success: false, message: `Opened YouTube search for ${args.query}. Try starting the Ambi server for better results.` };
          }
        } else if (name === "sendWhatsAppMessage") {
          const isMessagingEnabled = localStorage.getItem('isVoiceMessagingEnabled') !== 'false';
          if (!isMessagingEnabled) {
            result = { success: false, message: "Voice messaging is currently disabled by Admin." };
          } else {
            // Always use Puppeteer WhatsApp Web automation — never open wa.me or phone links
            try {
              // Auto-inject Chat ID if it matches the last incoming message and Gemini forgot it
              let finalChatId = args.chatId;
            if (!finalChatId && lastIncomingMessageRef.current && (args.name?.toLowerCase() === lastIncomingMessageRef.current.name.toLowerCase() || !args.name)) {
                finalChatId = lastIncomingMessageRef.current.chatId;
                console.log("Auto-injected chatId from last incoming message:", finalChatId);
            }

            const botsUrl = (import.meta as any).env.VITE_BOTS_URL || 'http://localhost:3000';
            const botResponse = await fetch(`${botsUrl}/whatsapp/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: args.name || args.number || lastIncomingMessageRef.current?.name || 'Unknown',
                message: args.message,
                chatId: finalChatId,
              }),
              signal: AbortSignal.timeout(60000),
            });
            const data = await botResponse.json();
            result = data;
          } catch (err: any) {
            // Bot is not running — tell Gemini so it can inform the user
            result = {
              success: false,
              message: 'WhatsApp bot is not running. Please start it with: cd whatsapp-bot && npm start',
            };
          }
          }
        } else if (name === "sendTelegramMessage") {
          const isMessagingEnabled = localStorage.getItem('isVoiceMessagingEnabled') !== 'false';
          if (!isMessagingEnabled) {
            result = { success: false, message: "Voice messaging is currently disabled by Admin." };
          } else {
            try {
              console.log(`Sending Telegram message to ${args.name || args.chatId}...`);
              const botsUrl = (import.meta as any).env.VITE_BOTS_URL || 'http://localhost:3000';
              const botResponse = await fetch(`${botsUrl}/telegram/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: args.name, message: args.message, chatId: args.chatId })
            });
            const data = await botResponse.json();
            
            result = {
              success: data.success,
              message: data.message || (data.success ? 'Telegram message sent' : 'Failed to send Telegram message'),
            };
          } catch (err: any) {
            result = {
              success: false,
              message: 'Telegram bot is not running. Please start it with: cd telegram-bot && npm start',
            };
          }
          }
        } else if (name === "initiateCall") {
          const cleanNumber = args.number.replace(/\D/g, '');
          window.location.href = `tel:${cleanNumber}`;
          result = { success: true, message: `Initiating call to ${args.number}` };
        }
      } catch (err) {
        result = { error: "Failed to execute tool" };
      }

      responses.push({ id, name, response: result });
    }

    sessionRef.current?.sendToolResponse({ functionResponses: responses });
  }, []);

  const connect = useCallback(async () => {
    if (connectingRef.current || isConnected) return;
    connectingRef.current = true;
    
    try {
      setError(null);
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          systemInstruction: ANAZ_SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          tools: [
            { functionDeclarations: [openWebsiteTool, searchTool, getDateTimeTool, playMusicTool, sendWhatsAppMessageTool, sendTelegramMessageTool, initiateCallTool] }
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            console.log("Connected to Gemini Live");
          },
          onclose: () => {
            setIsConnected(false);
            stopAudio();
            console.log("Disconnected from Gemini Live");
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            setError("Connection error. Please try again.");
          },
          onmessage: (message: any) => {
            // Log transcription for debugging
            if (message.inputAudioTranscription?.text) {
              const text = message.inputAudioTranscription.text.toLowerCase();
              console.log("AMBI heard:", text);
              setLastTranscription(message.inputAudioTranscription.text);
              
              const wakeWords = ["ambi", "hey ambi", "amby", "andy", "mb", "hello ambi"];
              if (wakeWords.some(word => text.includes(word))) {
                console.log("Wake word detected!");
                isAwakeRef.current = true;
                setIsAwake(true);
              }
            }

            if (message.serverContent?.modelTurn?.parts) {
              // Only process response if the assistant is awake
              if (isAwakeRef.current) {
                let textChunk = "";
                for (const part of message.serverContent.modelTurn.parts) {
                  if (part.text) {
                    textChunk += part.text;
                  }
                  if (part.inlineData?.data) {
                    // Decode base64 PCM audio (16-bit, 24kHz)
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
                if (textChunk) {
                  setAmbiTextResponse(prev => prev + textChunk);
                }
              }
            }

            if (message.toolCall) {
              handleToolCall(message.toolCall);
            }

            if (message.serverContent?.turnComplete) {
                // Stay awake for a bit longer to allow follow-up questions
                // Only reset if no new transcription arrives
                console.log("Turn complete. AMBI is waiting for follow-up...");
            }

            if (message.serverContent?.interrupted) {
              playbackQueueRef.current = [];
              isPlayingRef.current = false;
              nextStartTimeRef.current = 0;
            }
          },
        },
      });

      sessionRef.current = session;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.log("Connection attempt aborted");
      } else {
        console.error("Failed to connect:", err);
        setError("Failed to connect to AMBI.");
      }
    } finally {
      connectingRef.current = false;
    }
  }, [playNextChunk, stopAudio, handleToolCall, isConnected]);

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
        
        // Calculate volume for UI
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolume(Math.sqrt(sum / inputData.length));

        // Convert Float32 to Int16 PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }

        // Send to Gemini
        try {
          if (sessionRef.current && isConnected) {
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
            sessionRef.current.sendRealtimeInput({
              audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        } catch (err) {
          console.error("Error sending audio input:", err);
        }
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setError("Microphone access denied.");
    }
  }, [isConnected]);

  const disconnect = useCallback(() => {
    stopAudio();
    setLastTranscription("");
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        console.error("Error closing session:", err);
      }
      sessionRef.current = null;
    }
    setIsConnected(false);
  }, [stopAudio]);

  const sendVideoFrame = useCallback((base64: string) => {
    try {
      if (sessionRef.current && isConnected) {
        sessionRef.current.sendRealtimeInput({
          video: { data: base64, mimeType: 'image/jpeg' }
        });
      }
    } catch (err) {
      console.error("Error sending video frame:", err);
    }
  }, [isConnected]);

  const sendText = useCallback((text: string) => {
    if (!sessionRef.current || !isConnected) return;
    try {
      // Clear previous response before sending new text
      setAmbiTextResponse("");
      setLastTranscription(text);
      // Gemini GenAI SDK LiveSession accepts send(text)
      sessionRef.current.send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } });
      
      // Keep awake if interacting
      isAwakeRef.current = true;
      setIsAwake(true);
    } catch (err) {
      console.error("Error sending text command:", err);
    }
  }, [isConnected]);

  // ─────────────────────────────────────────────
  // Listen for incoming WhatsApp messages via SSE
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) return; // Only listen if connected to Gemini
    
    console.log("Starting SSE listener for WhatsApp...");
    const botsUrl = (import.meta as any).env.VITE_BOTS_URL || 'http://localhost:3000';
    const eventSource = new EventSource(`${botsUrl}/whatsapp/stream`);

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'connected') return;
        
        if (data.name && data.message) {
          console.log(`[SSE] Incoming from ${data.name}: ${data.message}`);
          lastIncomingMessageRef.current = { name: data.name, chatId: data.from };
          
          // Notify the Live Session so it can announce it
          if (sessionRef.current) {
              const systemPrompt = `[SYSTEM NOTIFICATION] An incoming message arrived from ${data.name}: "${data.message}". 
IMPORTANT: An auto-reply was ALREADY SENT on your behalf.
You MUST politely speak to the user to inform them: "Pranav, ${data.name} ka message aaya tha. Maine unhe auto-reply bhej diya hai." Do NOT ask for permission.`;
              
              sessionRef.current.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: systemPrompt }] }], turnComplete: true } });
              isAwakeRef.current = true;
              setIsAwake(true);
          }
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      eventSource.close();
      // Retry logic could be added, but simple timeout works
      setTimeout(() => {
        if (isConnected) {
            // It will handle reconnect on unmount/remount usually, 
            // but we might need a more robust reconnect later.
        }
      }, 5000);
    };

    return () => {
      console.log("Closing SSE listener...");
      eventSource.close();
    };
  }, [isConnected]);

  // ─────────────────────────────────────────────
  // Listen for incoming Telegram messages via SSE
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) return;
    
    console.log("Starting SSE listener for Telegram...");
    const botsUrl = (import.meta as any).env.VITE_BOTS_URL || 'http://localhost:3000';
    const eventSource = new EventSource(`${botsUrl}/telegram/stream`);

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'connected') return;
        
        if (data.name && data.message) {
          console.log(`[SSE Telegram] Incoming from ${data.name}: ${data.message}`);
          lastIncomingMessageRef.current = { name: data.name, chatId: data.from };
          
          if (sessionRef.current) {
              const systemPrompt = `[SYSTEM NOTIFICATION] An incoming TELEGRAM message arrived from ${data.name}: "${data.message}". 
IMPORTANT: An auto-reply was ALREADY SENT on your behalf.
You MUST politely speak to the user to inform them: "Pranav, ${data.name} ka Telegram par message aaya tha. Maine unhe auto-reply bhej diya hai." Do NOT ask for permission.`;
              
              sessionRef.current.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: systemPrompt }] }], turnComplete: true } });
              isAwakeRef.current = true;
              setIsAwake(true);
          }
        }
      } catch (err) {
        console.error("Error parsing Telegram SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("Telegram SSE connection error:", err);
      eventSource.close();
    };

    return () => {
      console.log("Closing Telegram SSE listener...");
      eventSource.close();
    };
  }, [isConnected]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const toggleAwake = useCallback(() => {
    isAwakeRef.current = !isAwakeRef.current;
    setIsAwake(isAwakeRef.current);
  }, []);

  return {
    isConnected,
    isRecording,
    isAwake,
    lastTranscription,
    ambiTextResponse,
    volume,
    error,
    connect,
    disconnect,
    startRecording,
    stopRecording: stopAudio,
    sendVideoFrame,
    sendText,
    setAmbiTextResponse,
    toggleAwake
  };
}
