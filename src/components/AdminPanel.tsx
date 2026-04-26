import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [stats, setStats] = useState<any>(null);
  const [waUsers, setWaUsers] = useState<number>(0);
  const [tgUsers, setTgUsers] = useState<number>(0);
  const [voiceMessaging, setVoiceMessaging] = useState<boolean>(true);

  // Initialize toggle state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('isVoiceMessagingEnabled');
    if (saved !== null) {
      setVoiceMessaging(saved === 'true');
    } else {
      localStorage.setItem('isVoiceMessagingEnabled', 'true');
    }
  }, []);

  const handleToggle = () => {
    const newVal = !voiceMessaging;
    setVoiceMessaging(newVal);
    localStorage.setItem('isVoiceMessagingEnabled', newVal.toString());
  };

  useEffect(() => {
    if (!isOpen) return;

    let intervalId: any;

    const fetchStats = async () => {
      try {
        const backendUrl = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:3000';
        
        // Main Server Stats
        const serverRes = await fetch(`${backendUrl}/api/admin/stats`);
        if (serverRes.ok) setStats(await serverRes.json());

        // WA Bot Stats
        try {
          const waRes = await fetch(`${backendUrl}/whatsapp/stats`);
          if (waRes.ok) setWaUsers((await waRes.json()).usersReached);
        } catch (e) {
          console.warn("WA Bot stats fetch failed", e);
        }

        // TG Bot Stats
        try {
          const tgRes = await fetch(`${backendUrl}/telegram/stats`);
          if (tgRes.ok) setTgUsers((await tgRes.json()).usersReached);
        } catch (e) {
          console.warn("TG Bot stats fetch failed", e);
        }
      } catch (err) {
        console.error("Error fetching admin stats:", err);
      }
    };

    fetchStats();
    intervalId = setInterval(fetchStats, 5000);

    return () => clearInterval(intervalId);
  }, [isOpen]);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 GB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, rgba(30, 30, 35, 0.9), rgba(20, 20, 25, 0.9))',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="text-white text-lg font-semibold tracking-wide flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-indigo-400">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                System Admin
              </h2>
              <button 
                onClick={onClose}
                className="text-white/50 hover:text-white transition-colors p-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Voice Messaging Toggle */}
              <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between border border-white/5">
                <div>
                  <h3 className="text-white font-medium">Voice Commanded Messaging</h3>
                  <p className="text-white/40 text-xs mt-1">Allow Ambi to send outgoing messages when commanded by voice.</p>
                </div>
                <button
                  onClick={handleToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${voiceMessaging ? 'bg-indigo-500' : 'bg-gray-600'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${voiceMessaging ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>

              {/* Server Load Section */}
              <div className="space-y-3">
                <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider">Server Load</h3>
                
                <div className="bg-white/5 rounded-xl p-4 border border-white/5 flex gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/70">CPU Usage</span>
                      <span className="text-white font-medium">{stats?.cpuLoad ?? 0}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 mb-4">
                      <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${stats?.cpuLoad ?? 0}%` }}></div>
                    </div>
                    
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/70">Memory (RAM)</span>
                      <span className="text-white font-medium">{stats ? formatBytes(stats.usedMem) : '0'} / {stats ? formatBytes(stats.totalMem) : '0'}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="bg-purple-400 h-1.5 rounded-full" style={{ width: stats ? `${(stats.usedMem / stats.totalMem) * 100}%` : '0%' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Users Reached Section */}
              <div className="space-y-3">
                <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider">AI Unique Contacts (Session)</h3>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 border border-green-500/20 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-green-500/5 group-hover:bg-green-500/10 transition-colors"></div>
                    <p className="text-white/50 text-xs relative z-10">WhatsApp</p>
                    <p className="text-2xl font-bold text-green-400 relative z-10">{waUsers}</p>
                  </div>
                  
                  <div className="bg-white/5 rounded-xl p-3 border border-blue-500/20 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors"></div>
                    <p className="text-white/50 text-xs relative z-10">Telegram</p>
                    <p className="text-2xl font-bold text-[#2AABEE] relative z-10">{tgUsers}</p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-3 border border-purple-500/20 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-purple-500/5 group-hover:bg-purple-500/10 transition-colors"></div>
                    <p className="text-white/50 text-xs relative z-10">Web Visits</p>
                    <p className="text-2xl font-bold text-purple-400 relative z-10">{stats?.webVisits ?? 0}</p>
                  </div>
                </div>
              </div>
              
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
