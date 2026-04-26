import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react';
import { Mic, MicOff, Phone, PhoneOff, Camera, CameraOff, Sparkles, AlertCircle, Zap, Activity, Volume2, Settings } from 'lucide-react';
import { useGeminiLive } from '../hooks/useGeminiLive';
import AdminPanel from './AdminPanel';

/* ─── Floating particles behind the orb ─── */
const PARTICLE_COUNT = 12;
function Particles({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full" style={{ borderRadius: '50%' }}>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
        const angle = (i / PARTICLE_COUNT) * 360;
        const radius = 80 + Math.random() * 40;
        const x = Math.cos((angle * Math.PI) / 180) * radius;
        const y = Math.sin((angle * Math.PI) / 180) * radius;
        const delay = (i / PARTICLE_COUNT) * 3;
        const size = 2 + Math.random() * 3;
        return active ? (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.8, 0],
              x: [0, x * 0.5, x],
              y: [0, y * 0.5, y],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 2.5,
              delay,
              repeat: Infinity,
              ease: 'easeOut',
            }}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: '50%',
              background: `hsl(${260 + i * 10}, 80%, 75%)`,
              top: '50%',
              left: '50%',
              marginTop: -size / 2,
              marginLeft: -size / 2,
            }}
          />
        ) : null;
      })}
    </div>
  );
}

/* ─── Animated waveform bars ─── */
function WaveBars({ volume, isRecording }: { volume: number; isRecording: boolean }) {
  const bars = 5;
  const baseHeights = [0.4, 0.7, 1.0, 0.7, 0.4];
  return (
    <div className="flex items-center justify-center gap-[5px] z-10">
      {Array.from({ length: bars }).map((_, i) => {
        const boost = volume > 0.01 ? volume * 60 * baseHeights[i] : 0;
        const base = isRecording ? baseHeights[i] * 18 + 4 : 10;
        return (
          <motion.div
            key={i}
            animate={{ height: base + boost }}
            transition={{ duration: 0.08, ease: 'linear' }}
            className="wave-bar"
            style={{ minHeight: 6, maxHeight: 52 }}
          />
        );
      })}
    </div>
  );
}

/* ─── Ripple rings around orb ─── */
function RippleRings({ volume, active }: { volume: number; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 200 + i * 40,
            height: 200 + i * 40,
            border: `1px solid rgba(168,85,247,${0.3 - i * 0.08})`,
            background: `rgba(168,85,247,${0.04 - i * 0.01})`,
          }}
          animate={{
            scale: [1, 1 + volume * 0.8 + i * 0.15, 1],
            opacity: [0.5 - i * 0.1, 0.2, 0.5 - i * 0.1],
          }}
          transition={{ duration: 0.15 + i * 0.05, ease: 'linear' }}
        />
      ))}
    </>
  );
}

/* ─── Orbital decoration rings ─── */
function OrbitalRings({ isConnected }: { isConnected: boolean }) {
  return (
    <AnimatePresence>
      {isConnected && (
        <>
          {/* Outer slow ring */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="absolute"
            style={{
              width: 230,
              height: 230,
              borderRadius: '50%',
              border: '1px dashed rgba(168,85,247,0.25)',
              animation: 'spin-slow 16s linear infinite',
            }}
          />
          {/* Inner faster ring */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="absolute"
            style={{
              width: 260,
              height: 260,
              borderRadius: '50%',
              border: '1px solid rgba(236,72,153,0.15)',
              animation: 'spin-slow-reverse 22s linear infinite',
            }}
          />
          {/* Dot on outer ring */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute"
            style={{
              width: 230,
              height: 230,
              animation: 'spin-slow 16s linear infinite',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(168,85,247,0.8)',
                boxShadow: '0 0 10px rgba(168,85,247,0.8)',
              }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Ambient background blobs ─── */
function AmbientBackground({ isConnected, isAwake }: { isConnected: boolean; isAwake: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Top-left blob — purple */}
      <motion.div
        animate={{
          opacity: isConnected ? (isAwake ? 0.55 : 0.35) : 0.12,
          scale: isConnected ? [1, 1.08, 1] : 1,
          x: isAwake ? [0, 15, 0] : 0,
        }}
        transition={{ duration: 5, repeat: Infinity, repeatType: 'mirror' }}
        style={{
          position: 'absolute',
          top: '-15%',
          left: '-15%',
          width: '65vw',
          height: '65vw',
          maxWidth: 750,
          maxHeight: 750,
          background: 'radial-gradient(circle, rgba(139,92,246,0.6) 0%, rgba(99,102,241,0.2) 50%, transparent 70%)',
          filter: 'blur(80px)',
          borderRadius: '50%',
        }}
      />
      {/* Bottom-right blob — pink */}
      <motion.div
        animate={{
          opacity: isConnected ? (isAwake ? 0.5 : 0.3) : 0.1,
          scale: isConnected ? [1, 1.06, 1] : 1,
          x: isAwake ? [0, -12, 0] : 0,
        }}
        transition={{ duration: 6, repeat: Infinity, repeatType: 'mirror', delay: 1.5 }}
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '-10%',
          width: '60vw',
          height: '60vw',
          maxWidth: 700,
          maxHeight: 700,
          background: 'radial-gradient(circle, rgba(236,72,153,0.5) 0%, rgba(244,114,182,0.15) 50%, transparent 70%)',
          filter: 'blur(80px)',
          borderRadius: '50%',
        }}
      />
      {/* Center subtle glow when awake */}
      <AnimatePresence>
        {isAwake && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              top: '30%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '50vw',
              height: '50vw',
              maxWidth: 500,
              maxHeight: 500,
              background: 'radial-gradient(circle, rgba(168,85,247,0.8) 0%, transparent 70%)',
              filter: 'blur(60px)',
              borderRadius: '50%',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main Interface ─── */
export default function ANAZInterface() {
  const {
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
    stopRecording,
    sendVideoFrame,
    sendText,
    toggleAwake,
  } = useGeminiLive();

  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [textInput, setTextInput] = useState('');

  // Auto-start microphone when connected
  useEffect(() => {
    if (isConnected && !isRecording) {
      startRecording();
    }
  }, [isConnected, isRecording, startRecording]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim() && isConnected) {
      sendText(textInput);
      setTextInput("");
    }
  };

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  // videoRef as callback ref — fires the instant element enters DOM
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && cameraStreamRef.current) {
      el.srcObject = cameraStreamRef.current;
      const tryPlay = () => el.play().catch(e => console.error('Camera play error:', e));
      if (el.readyState >= 1) {
        tryPlay();
      } else {
        el.onloadedmetadata = tryPlay;
      }
    }
  }, []);

  /* Register Web Visit */
  useEffect(() => {
    const backendUrl = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:3000';
    fetch(`${backendUrl}/api/visit`, { method: 'POST' }).catch(e => console.warn('Failed to record visit', e));
  }, []);

  /* Hide hint after first connection */
  useEffect(() => {
    if (isConnected) setShowHint(false);
  }, [isConnected]);

  /* Send camera frames to Gemini */
  useEffect(() => {
    let interval: any;
    if (isCameraActive && isConnected) {
      interval = setInterval(() => {
        if (videoRef.current && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 320, 240);
            const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
            sendVideoFrame(base64);
          }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCameraActive, isConnected, sendVideoFrame]);

  const toggleCamera = async () => {
    if (isCameraActive) {
      // Stop all camera tracks
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        cameraStreamRef.current = stream;
        // State update triggers re-render → video element mounts → useEffect assigns stream
        setIsCameraActive(true);
      } catch (err) {
        console.error('Camera access denied', err);
      }
    }
  };

  const handleCall = async () => {
    if (isConnected) {
      disconnect();
    } else {
      setIsConnecting(true);
      await connect();
      setIsConnecting(false);
    }
  };

  /* Derived state label */
  const statusLabel = !isConnected
    ? 'Offline'
    : isConnected && !isAwake
    ? 'Sleeping'
    : 'Active';

  const statusColor = !isConnected
    ? 'rgba(100,100,120,1)'
    : !isAwake
    ? 'rgba(99,102,241,1)'
    : 'rgba(34,197,94,1)';

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        background: '#04040a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
        padding: '0 20px',
      }}
    >
      {/* ── Background ── */}
      <AmbientBackground isConnected={isConnected} isAwake={isAwake} />

      {/* ── Subtle grid overlay ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ══════════════ HEADER ══════════════ */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 440,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 24,
        }}
      >
        {/* Logo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1,
                background: 'linear-gradient(135deg, #fff 0%, #c4b5fd 50%, #f472b6 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Ambi
            </h1>
            <motion.div
              animate={{ rotate: isConnected ? [0, 10, -5, 0] : 0 }}
              transition={{ duration: 2, repeat: isConnected ? Infinity : 0, repeatDelay: 4 }}
            >
              <Sparkles
                style={{
                  width: 16,
                  height: 16,
                  color: 'rgba(196,181,253,0.8)',
                  marginBottom: 6,
                }}
                strokeWidth={1.5}
              />
            </motion.div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <p
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              Your AI Companion
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* WhatsApp Pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(34,197,94,0.15)',
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(34,197,94,0.3)',
                  boxShadow: '0 0 10px rgba(34,197,94,0.1)',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#22c55e', filter: 'drop-shadow(0 0 2px rgba(34,197,94,0.4))' }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(34,197,94,1)' }}>
                  +91 9503223611
                </p>
              </div>
              
              {/* Telegram Pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(42,171,238,0.15)',
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(42,171,238,0.3)',
                  boxShadow: '0 0 10px rgba(42,171,238,0.1)',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#2AABEE', filter: 'drop-shadow(0 0 2px rgba(42,171,238,0.4))' }}>
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.676c.223-.197-.05-.31-.346-.11l-6.4 4.03-2.76-.86c-.6-.188-.61-.6.126-.89l10.81-4.17c.502-.18.966.11.85.835z"/>
                </svg>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#2AABEE' }}>
                  +91 7709664387
                </p>
              </div>
              
              {/* Settings / Admin Button */}
              <button 
                onClick={() => {
                  const pass = window.prompt("Admin Password:");
                  if (pass === ((import.meta as any).env.VITE_ADMIN_PASSWORD || 'pranav123')) {
                    setIsAdminOpen(true);
                  } else if (pass !== null) {
                    alert("Incorrect Password!");
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '5px 8px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                <Settings style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.6)' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Status pill */}
        <motion.button
          onClick={toggleAwake}
          disabled={!isConnected}
          whileTap={{ scale: 0.92 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '7px 16px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            cursor: isConnected ? 'pointer' : 'default',
            border: '1px solid',
            borderColor: !isConnected
              ? 'rgba(255,255,255,0.07)'
              : isAwake
              ? 'rgba(34,197,94,0.3)'
              : 'rgba(99,102,241,0.3)',
            background: !isConnected
              ? 'rgba(255,255,255,0.03)'
              : isAwake
              ? 'rgba(34,197,94,0.08)'
              : 'rgba(99,102,241,0.08)',
            color: statusColor,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            transition: 'all 0.4s ease',
            userSelect: 'none',
          }}
        >
          {/* Animated dot */}
          <motion.div
            animate={
              isConnected && isAwake
                ? { scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }
                : {}
            }
            transition={{ duration: 1, repeat: Infinity }}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: statusColor,
              boxShadow: isConnected ? `0 0 8px ${statusColor}` : 'none',
            }}
          />
          {statusLabel}
        </motion.button>
      </motion.header>

      {/* ══════════════ CENTER — ORB ══════════════ */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40,
          width: '100%',
        }}
      >
        {/* Orb container */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

          {/* Orbital rings decoration */}
          <OrbitalRings isConnected={isConnected} />

          {/* Volume-reactive ripples */}
          <RippleRings volume={volume} active={isConnected && isAwake} />

          {/* ── The Core Orb ── */}
          <motion.div
            animate={{
              scale: isConnected ? [1, 1.02, 1] : 1,
              rotate: !isConnected ? 0 : undefined,
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'relative',
              width: 168,
              height: 168,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
              background: isConnected
                ? 'linear-gradient(135deg, #7c3aed 0%, #a855f7 30%, #ec4899 70%, #f97316 100%)'
                : 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
              boxShadow: isConnected
                ? '0 0 0 1px rgba(168,85,247,0.3), 0 0 40px rgba(168,85,247,0.35), 0 0 80px rgba(236,72,153,0.2), 0 20px 60px rgba(0,0,0,0.6)'
                : '0 0 0 1px rgba(255,255,255,0.06), 0 20px 60px rgba(0,0,0,0.6)',
              transition: 'background 0.8s ease, box-shadow 0.8s ease',
            }}
          >
            {/* Glass shine */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.05) 40%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />
            {/* Inner shadow rim */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                boxShadow: 'inset 0 -8px 24px rgba(0,0,0,0.4), inset 0 4px 16px rgba(255,255,255,0.1)',
                pointerEvents: 'none',
              }}
            />

            {/* Particles (when awake/active) */}
            <Particles active={isConnected && isAwake} />

            {/* Content */}
            {isConnected ? (
              <WaveBars volume={volume} isRecording={isRecording} />
            ) : (
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles style={{ width: 36, height: 36, color: 'rgba(168,85,247,0.5)' }} strokeWidth={1} />
              </motion.div>
            )}
          </motion.div>

          {/* ── Camera PIP ── */}
          <AnimatePresence>
            {isCameraActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7, x: 10, y: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, x: 10, y: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                style={{
                  position: 'absolute',
                  top: -16,
                  right: -72,
                  width: 72,
                  height: 96,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(168,85,247,0.2)',
                  zIndex: 30,
                  background: '#000',
                }}
              >
                <video
                  ref={videoCallbackRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9, transform: 'scaleX(-1)' }}
                />
                {/* Camera indicator */}
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 6px #22c55e',
                    animation: 'pulse-glow 2s infinite',
                  }}
                />
                <canvas ref={canvasRef} width="320" height="240" style={{ display: 'none' }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ══ Transcription / Status Text ══ */}
        <div
          style={{
            width: '100%',
            maxWidth: 360,
            minHeight: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '0 16px',
          }}
        >
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 16,
                  color: 'rgba(252,165,165,1)',
                  fontSize: 13,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                {error}
              </motion.div>
            ) : isConnected && lastTranscription ? (
              <motion.div
                key={`t-${lastTranscription}`}
                initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                style={{ width: '100%' }}
              >
                {/* Quote mark */}
                <p
                  style={{
                    fontSize: 'clamp(0.95rem, 3.5vw, 1.25rem)',
                    fontWeight: 300,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.65,
                    color: 'rgba(255,255,255,0.88)',
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85em", display: "block", marginBottom: 4 }}>You: "{lastTranscription}"</span>
                  {ambiTextResponse && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{ color: "#a78bfa", fontWeight: 400, marginTop: 8, display: "block" }}
                    >
                      {ambiTextResponse}
                    </motion.span>
                  )}
                </p>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginTop: 12,
                    opacity: 0.6,
                  }}
                >
                  <Activity style={{ width: 11, height: 11, color: '#a78bfa' }} />
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      color: '#a78bfa',
                    }}
                  >
                    Ambi Heard You
                  </span>
                  <Activity style={{ width: 11, height: 11, color: '#a78bfa' }} />
                </motion.div>
              </motion.div>
            ) : isConnecting ? (
              <motion.div
                key="connecting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
              >
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      animate={{ y: [-4, 4, -4], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.9, delay: i * 0.18, repeat: Infinity }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(168,85,247,0.8)' }}
                    />
                  ))}
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 300 }}>
                  Connecting to Ambi…
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
              >
                <p
                  style={{
                    fontSize: 'clamp(0.9rem, 3.2vw, 1.1rem)',
                    fontWeight: 300,
                    color: 'rgba(255,255,255,0.35)',
                    lineHeight: 1.6,
                    textAlign: 'center',
                  }}
                >
                  {isConnected
                    ? <>Say <span style={{ color: 'rgba(196,181,253,0.7)', fontWeight: 500 }}>"Hey Ambi"</span> to wake me up</>
                    : 'Tap below to connect'}
                </p>
                {showHint && !isConnected && (
                  <motion.p
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: 300 }}
                  >
                    Requires microphone access
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ══════════════ BOTTOM CONTROLS ══════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
        style={{
          position: 'relative',
          zIndex: 20,
          width: '100%',
          maxWidth: 400,
          marginBottom: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        {/* Controls pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 999,
            boxShadow: '0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* ── Camera Button ── */}
          <motion.button
            onClick={toggleCamera}
            disabled={!isConnected}
            whileHover={isConnected ? { scale: 1.05 } : {}}
            whileTap={isConnected ? { scale: 0.9 } : {}}
            title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid',
              borderColor: isCameraActive ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.07)',
              background: isCameraActive
                ? 'rgba(168,85,247,0.15)'
                : isConnected
                ? 'rgba(255,255,255,0.04)'
                : 'transparent',
              color: isCameraActive ? '#a78bfa' : isConnected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s ease',
              boxShadow: isCameraActive ? '0 0 20px rgba(168,85,247,0.2)' : 'none',
            }}
          >
            {isCameraActive
              ? <Camera style={{ width: 18, height: 18 }} />
              : <CameraOff style={{ width: 18, height: 18 }} />
            }
          </motion.button>

          {/* ── Main Call Button ── */}
          <motion.button
            onClick={handleCall}
            whileTap={{ scale: 0.88 }}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              background: isConnected
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)',
              border: 'none',
              boxShadow: isConnected
                ? '0 0 0 1px rgba(239,68,68,0.3), 0 8px 32px rgba(239,68,68,0.4), 0 0 60px rgba(239,68,68,0.1)'
                : '0 0 0 1px rgba(168,85,247,0.4), 0 8px 32px rgba(168,85,247,0.45), 0 0 60px rgba(236,72,153,0.15)',
              transition: 'all 0.5s ease',
              color: '#fff',
            }}
          >
            {/* Shine */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />
            {/* Pulsing ring when idle */}
            <AnimatePresence>
              {!isConnected && (
                <motion.div
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    border: '2px solid rgba(168,85,247,0.5)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </AnimatePresence>
            {isConnected
              ? <PhoneOff style={{ width: 24, height: 24, position: 'relative' }} />
              : <Phone style={{ width: 24, height: 24, position: 'relative', marginLeft: 2 }} />
            }
          </motion.button>

          {/* ── Mic Button ── */}
          <motion.button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={!isConnected}
            whileHover={isConnected ? { scale: 1.05 } : {}}
            whileTap={isConnected ? { scale: 0.9 } : {}}
            title="Hold to speak"
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid',
              borderColor: isRecording ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.07)',
              background: isRecording
                ? 'rgba(236,72,153,0.15)'
                : isConnected
                ? 'rgba(255,255,255,0.04)'
                : 'transparent',
              color: isRecording ? '#f472b6' : isConnected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s ease',
              boxShadow: isRecording ? '0 0 20px rgba(236,72,153,0.25)' : 'none',
              userSelect: 'none',
            }}
          >
            {isRecording
              ? <Volume2 style={{ width: 18, height: 18 }} />
              : isConnected
              ? <Mic style={{ width: 18, height: 18 }} />
              : <MicOff style={{ width: 18, height: 18 }} />
            }
          </motion.button>
        </div>

        {/* Mic hint label */}
        <AnimatePresence>
          {isConnected && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.2)',
              }}
            >
              Hold mic to speak · Tap status to toggle
            </motion.p>
          )}
        </AnimatePresence>
        {/* Chat input form */}
        <AnimatePresence>
          {isConnected && (
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onSubmit={handleTextSubmit}
              style={{
                width: '100%',
                display: 'flex',
                gap: 8,
                marginTop: -8,
              }}
            >
              <input
                type="text"
                placeholder="Type a message to Ambi..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 999,
                  padding: '12px 20px',
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'Outfit, sans-serif',
                }}
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                style={{
                  background: textInput.trim() ? '#a855f7' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 999,
                  padding: '0 20px',
                  fontWeight: 600,
                  cursor: textInput.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background 0.3s ease',
                  fontFamily: 'Outfit, sans-serif',
                }}
              >
                Send
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
      {/* Modals */}
      <AdminPanel isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
    </div>
  );
}
