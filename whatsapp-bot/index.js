/**
 * index.js — WhatsApp Web Automation using whatsapp-web.js
 * Ambi-style: Uses direct APIs, fast, and saves session properly.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const keyStatus = {}; // Tracks cooldown for API keys
const messageEmitter = new EventEmitter();

let exclusions = { ignoreGroups: true, ignoredContacts: [] };
try {
    const configPath = path.join(__dirname, 'exclusions.json');
    if (fs.existsSync(configPath)) {
        exclusions = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.error('[WhatsApp] Failed to load exclusions.json:', e.message);
}

// Collect all Gemini API Keys from process.env
const apiKeys = [];
if (process.env.GEMINI_API_KEY) apiKeys.push(process.env.GEMINI_API_KEY);
for (let i = 1; i <= 20; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && !apiKeys.includes(k)) apiKeys.push(k);
}

console.log(`[WhatsApp] 🚀 Loaded ${apiKeys.length} Gemini API keys.`);

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa_auth_session' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isReady = false;

client.on('qr', (qr) => {
    console.log('\n[WhatsApp] 📱 SCAN THIS QR CODE:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    isReady = true;
    console.log('[WhatsApp] ✅ WhatsApp Client is READY!');
});

client.on('message_create', async (msg) => {
    if (msg.fromMe) return;

    const chat = await msg.getChat();
    if (chat.isGroup && exclusions.ignoreGroups) return;

    const senderName = msg._data.notifyName || 'Friend';
    const messageBody = msg.body;

    console.log(`[WhatsApp] 📩 Message from ${senderName}: "${messageBody}"`);

    setTimeout(async () => {
        let replyText = "Main abhi busy hu, thodi der me message karti hu. (Ambi)";
        let success = false;

        for (let i = 0; i < apiKeys.length; i++) {
            const key = apiKeys[i];
            if (keyStatus[key] && keyStatus[key] > Date.now()) continue;

            try {
                // Using v1 for stable production support
                const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`;
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ 
                            parts: [{ 
                                text: `System: You are Ambi, Pranav's personal AI assistant. Be friendly, cute, and helpful. Speak in Hinglish. Reply to ${senderName} who said: "${messageBody}". Short reply only.` 
                            }] 
                        }]
                    })
                });

                const data = await response.json();

                if (response.status === 429) {
                    console.log(`[WhatsApp] ⚠️ Key ${i+1} Rate Limited.`);
                    keyStatus[key] = Date.now() + 5000;
                    continue;
                }

                if (data.candidates && data.candidates[0].content) {
                    replyText = data.candidates[0].content.parts[0].text.trim();
                    console.log(`[WhatsApp] ✅ Key ${i+1} success!`);
                    success = true;
                    break;
                } else if (data.error) {
                    console.log(`[WhatsApp] ❌ Key ${i+1} Error: ${data.error.message}`);
                    if (data.error.message.includes('expired') || data.error.message.includes('API_KEY_INVALID')) {
                        keyStatus[key] = Date.now() + 3600000; // 1 hour cooldown for invalid keys
                    }
                } else {
                    console.log(`[WhatsApp] ⚠️ Key ${i+1} blocked by Safety Filter.`);
                }
            } catch (err) {
                console.log(`[WhatsApp] ❌ Key ${i+1} Network Error.`);
            }
        }

        await chat.sendMessage(replyText);
        console.log(`[WhatsApp] 🤖 Replied: "${replyText.substring(0, 50)}..."`);
    }, 2000);
});

client.initialize();

async function sendWhatsAppMessage(name, message, chatId) {
    if (!isReady) return { success: false, message: 'Not ready' };
    try {
        const target = chatId ? await client.getChatById(chatId) : null;
        if (target) {
            await target.sendMessage(message);
            return { success: true };
        }
        return { success: false, message: 'Chat not found' };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

module.exports = { sendWhatsAppMessage };
