/**
 * server.js - Express API for WhatsApp Automation
 * POST /send  →  { name, message }
 * POST /parse →  { command }  (parse natural language)
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { sendWhatsAppMessage, messageEmitter, introducedContacts } = require('./index');
const { parseWhatsAppCommand, buildCommand } = require('./parser');

const app = express();
const PORT = process.env.WA_PORT || 4000;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// GET /stream (Server-Sent Events)
// ─────────────────────────────────────────────
app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  // Send initial ping
  res.write('data: {"status": "connected"}\n\n');

  const onMessage = (msg) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };

  messageEmitter.on('new_message', onMessage);

  req.on('close', () => {
    messageEmitter.off('new_message', onMessage);
  });
});


// ─────────────────────────────────────────────
// POST /send
// Body: { name: "Rahul", message: "Hello bro", chatId: "..." }
// ─────────────────────────────────────────────
app.post('/send', async (req, res) => {
  const { name, message, chatId } = req.body;

  if (!name || !message) {
    return res.status(400).json({
      success: false,
      error: 'Both "name" and "message" fields are required.',
    });
  }

  console.log(`[API] /send → name: "${name}", message: "${message}", chatId: "${chatId || 'none'}"`);
  const result = await sendWhatsAppMessage(name, message, chatId);
  return res.json(result);
});

// ─────────────────────────────────────────────
// GET /stats
// ─────────────────────────────────────────────
app.get('/stats', (req, res) => {
  res.json({ usersReached: introducedContacts.size });
});

// ─────────────────────────────────────────────
// POST /log
// ─────────────────────────────────────────────
app.post('/log', (req, res) => {
  const { error } = req.body;
  console.error(`[FRONTEND ERROR] ${error}`);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// POST /parse
// Body: { command: "Send WhatsApp message to Rahul: Hello bro" }
// ─────────────────────────────────────────────
app.post('/parse', async (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ success: false, error: '"command" field is required.' });
  }

  const parsed = parseWhatsAppCommand(command);
  if (!parsed) {
    return res.status(400).json({
      success: false,
      error: 'Could not parse command. Use format: "Send WhatsApp message to NAME: MESSAGE"',
    });
  }

  console.log(`[API] /parse → name: "${parsed.name}", message: "${parsed.message}"`);
  const result = await sendWhatsAppMessage(parsed.name, parsed.message);
  return res.json({ ...result, parsed });
});

// ─────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'WhatsApp Automation Bot', port: PORT });
});

app.listen(PORT, () => {
  console.log(`\n🤖 WhatsApp Bot API running at http://localhost:${PORT}`);
  console.log(`   POST /send   → { name, message }`);
  console.log(`   POST /parse  → { command }`);
  console.log(`   GET  /health → status check\n`);
});
