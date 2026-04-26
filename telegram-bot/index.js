const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input'); // npm i input
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const messageEmitter = new EventEmitter();
const introducedContacts = new Set();

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
    console.error('[Telegram] ❌ Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env');
    process.exit(1);
}

const sessionPath = path.join(__dirname, 'session.txt');
let stringSession = new StringSession('');
if (fs.existsSync(sessionPath)) {
    stringSession = new StringSession(fs.readFileSync(sessionPath, 'utf8'));
}

const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

let isReady = false;

async function initClient() {
    console.log('[Telegram] 🚀 Initializing Telegram Client...');
    await client.start({
        phoneNumber: async () => '+917709664387',
        password: async () => await input.text('Please enter your password (if 2FA enabled): '),
        phoneCode: async () => await input.text('Please enter the code you received: '),
        onError: (err) => console.log('[Telegram] ❌ Error:', err),
    });

    console.log('\n[Telegram] ✅ Client is ready and authenticated!');
    fs.writeFileSync(sessionPath, client.session.save());
    isReady = true;

    // Load exclusions if any (we can use the same exclusions.json concept as whatsapp)
    let exclusions = { ignoreGroups: true, ignoredContacts: [] };
    try {
        const configPath = path.join(__dirname, 'exclusions.json');
        if (fs.existsSync(configPath)) {
            exclusions = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        // ignore
    }

    const botStartTime = Math.floor(Date.now() / 1000);

    client.addEventHandler(async (event) => {
        const message = event.message;
        if (!message || message.date < botStartTime) return;
        if (message.out) return; // Ignore own outgoing messages

        const sender = await message.getSender();
        if (!sender) return;

        const isGroup = message.isGroup;
        if (isGroup && exclusions.ignoreGroups) return;

        const senderName = sender.firstName ? `${sender.firstName} ${sender.lastName || ''}`.trim() : (sender.title || sender.username || 'Unknown');
        const messageBody = message.message;

        if (!messageBody) return; // Ignore non-text messages for now

        console.log(`[Telegram] 📩 New incoming message from "${senderName}": ${messageBody}`);

        // Broadcast to frontend
        messageEmitter.emit('new_message', {
            name: senderName,
            message: messageBody,
            from: sender.id.toString()
        });

        // 🤖 AUTONOMOUS AUTO-REPLY LOGIC
        setTimeout(async () => {
            try {
                const chatIdStr = sender.id.toString();
                const hasBeenIntroduced = introducedContacts.has(chatIdStr);
                if (!hasBeenIntroduced) {
                    introducedContacts.add(chatIdStr);
                }
                const introInstruction = hasBeenIntroduced 
                    ? "" 
                    : " ALWAYS start your reply by introducing yourself briefly as Pranav's personal AI assistant.";

                let replyText = hasBeenIntroduced
                    ? "Abhi mera server kaafi busy hai kyunki main testing phase me hu. 🙏 Aap please 24 hours ke baad message karein!"
                    : "Hello! Mai Ambi hu, Pranav ki personal AI assistant. 🌟\n\nThank you for reaching out! Abhi mera server kaafi busy hai kyunki main testing phase (free API) par chal rahi hu. Aap please 24 hours ke baad message karein! 🙏";
                
                let apiKeys = [];
                for (const k of Object.keys(process.env)) {
                    if (k.includes('GEMINI') && process.env[k] && process.env[k].startsWith('AIza')) {
                        if (!apiKeys.includes(process.env[k])) apiKeys.push(process.env[k]);
                    }
                }
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const envPath = path.join(__dirname, '..', '.env');
                    if (fs.existsSync(envPath)) {
                        const content = fs.readFileSync(envPath, 'utf8');
                        const matches = content.match(/AIza[a-zA-Z0-9_-]{35}/g);
                        if (matches) {
                            for (const m of matches) {
                                if (!apiKeys.includes(m)) apiKeys.push(m);
                            }
                        }
                    }
                } catch (e) {}
                
                console.log(`[Telegram] 🔑 Loaded ${apiKeys.length} unique API keys for auto-reply.`);

                if (apiKeys.length > 0) {
                    apiKeys = apiKeys.sort(() => Math.random() - 0.5);
                    let success = false;
                    for (const apiKey of apiKeys) {
                        console.log(`[Telegram] 🔑 Attempting auto-reply with API key ending in ...${apiKey.slice(-4)}`);
                        try {
                            const apiRes = await global.fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{
                                        parts: [{ text: `You are Ambi, Pranav's personal AI assistant. You received a Telegram message from ${senderName}: "${messageBody}". Write a short, friendly Hinglish reply without quotes. Do not use emojis.${introInstruction}` }]
                                    }]
                                })
                            });

                            const apiData = await apiRes.json();

                            if (apiRes.status === 429) continue;

                            if (apiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
                                replyText = apiData.candidates[0].content.parts[0].text.trim();
                                success = true;
                                break;
                            }
                        } catch (e) {
                            console.log(`[Telegram] ❌ Request failed: ${e.message}`);
                        }
                    }
                    if (!success) console.log("[Telegram] ❌ All API keys failed. Using fallback reply.");
                } else {
                    console.log("[Telegram] ❌ No API Key found, using fallback reply.");
                }

                console.log(`[Telegram] 🤖 Auto-replying to ${senderName}: "${replyText}"`);
                await client.sendMessage(message.chatId, { message: replyText });
                console.log(`[Telegram] ✅ Auto-reply sent successfully!`);
            } catch (err) {
                console.error(`[Telegram] ❌ Failed in auto-reply logic:`, err.message);
            }
        }, 2000);

    }, new NewMessage({}));
}

/**
 * Send a Telegram message to a contact by name or ID
 */
async function sendTelegramMessage(name, messageText, chatId) {
    if (!isReady) {
        return { success: false, message: 'Telegram client is not ready yet.' };
    }

    try {
        if (chatId) {
            try {
                console.log(`[Telegram] ✍️ Replying directly to Chat ID: ${chatId}`);
                await client.sendMessage(chatId, { message: messageText });
                console.log(`[Telegram] ✅ Message sent successfully.`);
                return { success: true, message: `✅ Replied successfully.` };
            } catch (err) {
                console.log(`[Telegram] ⚠️ Direct Chat ID failed, falling back to name search...`);
            }
        }

        console.log(`[Telegram] 🔍 Searching for dialog: "${name}" ...`);
        
        const dialogs = await client.getDialogs();
        let targetDialog = null;

        for (const dialog of dialogs) {
            const dName = dialog.title || dialog.name || '';
            if (dName.toLowerCase().includes(name.toLowerCase())) {
                targetDialog = dialog;
                break;
            }
        }

        if (!targetDialog) {
             return { success: false, message: `❌ No dialog found matching "${name}".` };
        }
        
        console.log(`[Telegram] ✅ Found dialog: ${targetDialog.title || targetDialog.name}`);
        console.log(`[Telegram] ✍️ Sending message...`);
        
        await client.sendMessage(targetDialog.id, { message: messageText });
        console.log(`[Telegram] ✅ Message sent to "${name}": "${messageText}"`);
        
        return {
            success: true,
            message: `✅ Message sent to "${targetDialog.title || targetDialog.name}" successfully.`,
        };
    } catch (error) {
        console.error('[Telegram] ❌ Error:', error);
        return {
            success: false,
            message: `❌ Failed: ${error.message}`,
        };
    }
}

module.exports = { client, initClient, sendTelegramMessage, messageEmitter, introducedContacts };

if (require.main === module) {
    initClient().catch(console.error);
}
