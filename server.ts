import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Import WA and TG bots
const { sendWhatsAppMessage, messageEmitter: waEmitter, introducedContacts: waContacts } = require('./whatsapp-bot/index.js');
const { initClient: initTelegram, sendTelegramMessage, messageEmitter: tgEmitter, introducedContacts: tgContacts } = require('./telegram-bot/index.js');

// Initialize Telegram Client
initTelegram().catch((err: any) => console.error('[API] ❌ Failed to initialize Telegram client:', err));

app.use(express.json());

let webVisits = 0;

// Allow CORS so Vite dev server (port 5173) can call this API
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Recursively walk any JSON object and return the first "videoId" string of 11 chars
function extractFirstVideoId(obj: any, depth = 0): string | null {
  if (depth > 20 || obj === null || obj === undefined) return null;
  if (typeof obj === "string" && /^[a-zA-Z0-9_-]{11}$/.test(obj)) return null; // too loose, skip
  if (typeof obj !== "object") return null;

  if (typeof obj.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(obj.videoId)) {
    // Skip ad-related entries
    if (obj.videoRenderer || obj.compactVideoRenderer || obj.gridVideoRenderer || obj.playlistVideoRenderer) {
      return obj.videoId;
    }
    // Also accept bare videoId if parent has title (real video)
    if (obj.title) return obj.videoId;
  }

  for (const key of Object.keys(obj)) {
    if (key === "videoId" && typeof obj[key] === "string" && /^[a-zA-Z0-9_-]{11}$/.test(obj[key])) {
      // Only accept if sibling keys suggest a real video renderer
      const siblings = Object.keys(obj);
      const isVideo = siblings.some(s => ["title", "thumbnail", "lengthText", "viewCountText", "shortBylineText"].includes(s));
      if (isVideo) return obj[key] as string;
    }
    const found = extractFirstVideoId(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// API Route to find YouTube Video ID
app.get("/api/youtube-search", async (req, res) => {
  const query = (req.query.q as string) || "";
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    const html = await response.text();

    let videoId: string | null = null;

    // ── Strategy 1: Extract ytInitialData JSON and walk it ──
    const initDataIdx = html.indexOf("ytInitialData");
    if (initDataIdx !== -1) {
      // Find the opening brace
      const braceIdx = html.indexOf("{", initDataIdx);
      if (braceIdx !== -1) {
        // Find matching closing brace (balanced)
        let depth = 0;
        let end = braceIdx;
        for (let i = braceIdx; i < Math.min(html.length, braceIdx + 2_000_000); i++) {
          if (html[i] === "{") depth++;
          else if (html[i] === "}") {
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
        try {
          const ytData = JSON.parse(html.slice(braceIdx, end + 1));
          videoId = extractFirstVideoId(ytData);
        } catch {
          // JSON parse failed, fall through to regex
        }
      }
    }

    // ── Strategy 2: Quick regex fallbacks ──
    if (!videoId) {
      const patterns = [
        /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"\s*,\s*"thumbnail"/,
        /"videoRenderer"\s*:\s*\{\s*"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
        /"watchEndpoint"\s*:\s*\{\s*"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
        /\/watch\?v=([a-zA-Z0-9_-]{11})(?:&|")/,
        /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) { videoId = match[1]; break; }
      }
    }

    if (videoId) {
      console.log(`✅ Found video ID: ${videoId} for query: "${query}"`);
      res.json({ videoId });
    } else {
      console.log(`❌ No video ID found for query: "${query}" (HTML length: ${html.length})`);
      res.status(404).json({ error: "No video found" });
    }
  } catch (error) {
    console.error("YouTube search error:", error);
    res.status(500).json({ error: "Failed to search YouTube" });
  }
});

// API Route to register a web visit
app.post("/api/visit", (req, res) => {
  webVisits++;
  res.json({ success: true, total: webVisits });
});

// API Route for Admin Stats
app.get("/api/admin/stats", (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  
  // Calculate average CPU load across all cores
  let totalIdle = 0;
  let totalTick = 0;
  for (const core of cpus) {
    for (const type in core.times) {
      totalTick += (core.times as any)[type];
    }
    totalIdle += core.times.idle;
  }
  const cpuLoad = 100 - ~~(100 * totalIdle / totalTick);
  
  res.json({
    cpuLoad, // Percentage
    totalMem, // Bytes
    freeMem,  // Bytes
    usedMem: totalMem - freeMem,
    webVisits, // Count
  });
});


// ==========================================
// WhatsApp Bot Unified Routes
// ==========================================
app.post('/whatsapp/send', async (req, res) => {
  const { name, message, chatId } = req.body;
  if (!name || !message) {
    return res.status(400).json({ success: false, error: 'Both "name" and "message" fields are required.' });
  }
  console.log(`[Unified] /whatsapp/send → name: "${name}", message: "${message}", chatId: "${chatId || 'none'}"`);
  const result = await sendWhatsAppMessage(name, message, chatId);
  res.json(result);
});

app.get('/whatsapp/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write('data: {"status": "connected"}\n\n');
  const onMessage = (msg: any) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  waEmitter.on('new_message', onMessage);
  req.on('close', () => waEmitter.off('new_message', onMessage));
});

app.get('/whatsapp/stats', (req, res) => {
  res.json({ usersReached: waContacts.size });
});

// ==========================================
// Telegram Bot Unified Routes
// ==========================================
app.post('/telegram/send', async (req, res) => {
  const { name, message, chatId } = req.body;
  if (!name && !chatId) return res.status(400).json({ success: false, message: 'Name or chatId is required' });
  if (!message) return res.status(400).json({ success: false, message: 'Message is required' });
  
  console.log(`[Unified] Received request to send Telegram message to: ${name || chatId}`);
  const result = await sendTelegramMessage(name, message, chatId);
  if (result.success) res.json(result);
  else res.status(500).json(result);
});

app.get('/telegram/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);
  const handleNewMessage = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  tgEmitter.on('new_message', handleNewMessage);
  req.on('close', () => tgEmitter.off('new_message', handleNewMessage));
});

app.get('/telegram/stats', (req, res) => {
  res.json({ usersReached: tgContacts.size });
});

// Serve static files from dist in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`   /api/youtube-search?q=<query>`);
});
