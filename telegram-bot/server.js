const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class TelegramBotEmitter extends EventEmitter {}
const messageEmitter = new TelegramBotEmitter();

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// SSE Stream for Frontend (Port 4002)
// ─────────────────────────────────────────────
app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    res.write(': connected\n\n');
    const pingInterval = setInterval(() => { res.write(':\n\n'); }, 15000);

    const messageListener = (msg) => {
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
    };

    messageEmitter.on('new_tg_message', messageListener);

    req.on('close', () => {
        clearInterval(pingInterval);
        messageEmitter.removeListener('new_tg_message', messageListener);
    });
});

const PORT = 4002;
app.listen(PORT, () => {
    console.log(`\n📡 Telegram SSE Stream running at http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────
// Environment Utilities
// ─────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
function getEnvVar(key) {
    if (process.env[key]) return process.env[key];
    try {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
            if (match && match[1]) return match[1].trim();
        }
    } catch (e) {}
    return null;
}

function updateEnvVar(key, value) {
    try {
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf-8');
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (envContent.match(regex)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
            fs.writeFileSync(envPath, envContent);
        }
    } catch (e) {}
}

// ─────────────────────────────────────────────
// Telegram Client Setup
// ─────────────────────────────────────────────
const apiId = parseInt(getEnvVar('TG_API_ID') || '0');
const apiHash = getEnvVar('TG_API_HASH') || '';
const sessionString = getEnvVar('TG_SESSION') || '';
const stringSession = new StringSession(sessionString);

const botStartTime = Math.floor(Date.now() / 1000);

async function startTelegram() {
    if (!apiId || !apiHash) {
        console.error('\n[Telegram] ❌ Missing TG_API_ID or TG_API_HASH in .env!');
        console.log('1. Go to https://my.telegram.org/apps');
        console.log('2. Log in and create an app to get your api_id and api_hash.');
        console.log('3. Add them to your Ambi/.env file:');
        console.log('TG_API_ID=your_id');
        console.log('TG_API_HASH=your_hash\n');
        return;
    }

    console.log('[Telegram] 🚀 Initializing Telegram Client...');
    
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text('📱 Enter your Telegram Phone Number (with country code, e.g. +919876543210): '),
        password: async () => await input.text('🔒 Enter your 2-Step Verification Password (if any): '),
        phoneCode: async () => await input.text('📩 Enter the OTP sent to your Telegram: '),
        onError: (err) => console.log(err),
    });

    console.log('[Telegram] ✅ You are connected to Telegram!');
    
    // Save the session string so we don't have to login again
    const newSession = client.session.save();
    if (newSession !== sessionString) {
        updateEnvVar('TG_SESSION', newSession);
        console.log('[Telegram] 💾 Session saved to .env file.');
    }

    // Get our own ID so we don't reply to ourselves
    const me = await client.getMe();

    client.addEventHandler(async (event) => {
        const message = event.message;

        // Ignore old messages
        if (message.date < botStartTime) return;

        // Only reply to private messages (not groups/channels)
        if (!message.isPrivate) return;

        // Ignore our own outgoing messages
        if (message.out || message.senderId.toString() === me.id.toString()) return;

        // Ignore empty messages (like just a photo or sticker without text)
        if (!message.message) return;

        const sender = await message.getSender();
        const senderName = sender.firstName || sender.username || 'Someone';

        console.log(`[Telegram] 📩 New message from "${senderName}": ${message.message}`);

        // Emit to Frontend
        messageEmitter.emit('new_tg_message', {
            name: senderName,
            message: message.message
        });

        // Generate and send reply
        await handleIncomingMessage(client, event.message.chatId, senderName, message.message);
        
    }, new NewMessage({}));
}

// ─────────────────────────────────────────────
// Gemini API Reply Generation
// ─────────────────────────────────────────────
const keyStatus = {}; // Tracks rate-limited keys

async function handleIncomingMessage(client, chatId, senderName, messageBody) {
    try {
        let replyText = "Main abhi busy hu, thodi der me message karti hu.";
        
        let apiKeys = [];
        try {
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf-8');
                const lines = envContent.split('\n');
                for (const line of lines) {
                    const match = line.match(/GEMINI_API_KEY.*?=(.+)/);
                    if (match && match[1]) {
                        const k = match[1].trim();
                        if (!apiKeys.includes(k)) apiKeys.push(k);
                    }
                }
            }
        } catch (e) {}
        
        if (apiKeys.length > 0) {
            const now = Date.now();
            // Only pick keys that are NOT in cooldown (or if cooldown expired)
            let activeKeys = apiKeys.filter(k => !keyStatus[k] || keyStatus[k] < now);
            
            // If all keys are exhausted, try them all again as a last resort
            if (activeKeys.length === 0) activeKeys = apiKeys;

            // Shuffle array
            activeKeys.sort(() => Math.random() - 0.5);
            
            for (let i = 0; i < activeKeys.length; i++) {
                const apiKey = activeKeys[i];
                // Hide key for logging: show only first 10 chars
                const shortKey = apiKey.substring(0, 10) + '...';
                console.log(`[Telegram] 🔑 Trying API key (${shortKey}) [${i + 1}/${activeKeys.length}]`);
                
                try {
                    const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{ text: `You are Ambi, Pranav's personal AI assistant. Always politely introduce yourself as Pranav's AI assistant answering on his behalf. You received a Telegram message from ${senderName}: "${messageBody}". Write a short, friendly Hinglish reply without quotes.` }]
                            }]
                        })
                    });
                    
                    if (apiRes.status === 429 || apiRes.status === 403) {
                        console.log(`[Telegram] ⚠️ Key rate-limited (Status ${apiRes.status}). Putting in 10-second cooldown.`);
                        keyStatus[apiKey] = Date.now() + 10000;
                        continue;
                    }

                    const apiData = await apiRes.json();
                    
                    if (apiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
                        replyText = apiData.candidates[0].content.parts[0].text.trim();
                        keyStatus[apiKey] = 0; // Mark as healthy
                        break; // Success!
                    } else {
                        const errorMsg = apiData.error?.message || "Safety filter or empty response";
                        console.log(`[Telegram] ⚠️ Key failed. Reason: ${errorMsg}. Cooldown for 30s.`);
                        keyStatus[apiKey] = Date.now() + 30000;
                    }
                } catch (e) {
                    console.log(`[Telegram] ⚠️ Key network error: ${e.message}. Cooldown for 30s.`);
                    keyStatus[apiKey] = Date.now() + 30000;
                }
            }
        }

        console.log(`[Telegram] 🤖 Auto-replying to ${senderName}: "${replyText}"`);
        
        // Send the reply
        await client.sendMessage(chatId, { message: replyText });
        console.log(`[Telegram] ✅ Auto-reply sent successfully!`);
    } catch (err) {
        console.error(`[Telegram] ❌ Failed to send reply:`, err.message);
    }
}

// Run the bot
startTelegram();
