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

const keyStatus = {}; // Tracks rate-limited API keys
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

console.log('[WhatsApp] 🚀 Initializing WhatsApp Client...');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa_auth_session' }),
    puppeteer: {
        headless: true, // Run headlessly
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let isReady = false;

client.on('qr', (qr) => {
    console.log('\n[WhatsApp] 📱 SCAN THIS QR CODE TO LOG IN:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    isReady = true;
    console.log('\n[WhatsApp] ✅ Client is ready and authenticated!');
});

client.on('authenticated', () => {
    console.log('[WhatsApp] 🔐 Authenticated successfully.');
});

client.on('auth_failure', msg => {
    console.error('[WhatsApp] ❌ Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
    console.log('[WhatsApp] ⚠️ Client was logged out', reason);
    isReady = false;
});

const botStartTime = Math.floor(Date.now() / 1000);

client.on('message', async msg => {
    // Ignore status updates
    if (msg.isStatus || msg.from === 'status@broadcast' || msg.to === 'status@broadcast') {
        return;
    }

    // Ignore old messages that were sent before the bot started
    if (msg.timestamp < botStartTime) {
        return;
    }

    // Reload exclusions on each message to allow live updates to exclusions.json
    try {
        const configPath = path.join(__dirname, 'exclusions.json');
        if (fs.existsSync(configPath)) {
            exclusions = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) { /* ignore */ }

    const isGroup = msg.from.endsWith('@g.us');
    
    // Check if we should ignore groups
    if (isGroup && exclusions.ignoreGroups) {
        return; // Ignore by default based on config
    }
    
    // Determine sender name
    const contact = await msg.getContact();
    const senderName = contact.name || contact.pushname || msg.from;
    const messageBody = msg.body;

    // Check exclusions
    const isExcluded = (exclusions.groups && exclusions.groups.some(group => senderName.includes(group))) ||
                       (exclusions.contacts && exclusions.contacts.some(excludedContact => senderName.toLowerCase().includes(excludedContact.toLowerCase())));
    
    if (isExcluded) {
        console.log(`[WhatsApp] 🚫 Ignored message from excluded contact/group: ${senderName}`);
        return;
    }

    console.log(`[WhatsApp] 📩 New incoming message from "${senderName}": ${messageBody}`);

    // Broadcast to frontend so Ambi can announce it
    messageEmitter.emit('new_message', {
        name: senderName,
        message: messageBody,
        from: msg.from
    });

    // 🤖 AUTONOMOUS AUTO-REPLY LOGIC (Backend)
    // Cooldown tracker scoped outside the setTimeout but inside the module or listener scope
    // Actually, to persist across messages, it must be declared globally.
    // I will attach it to global context if not exists, or just use a module-level variable.
    setTimeout(async () => {
        try {
            let replyText = "Main abhi busy hu, thodi der me message karti hu.";
            
            // Try to get a smart reply from Gemini by reading API keys from parent .env
            let apiKeys = [];
            // First check environment variables directly
            for (const key of Object.keys(process.env)) {
                if (key.includes('GEMINI_API_KEY') && process.env[key]) {
                    apiKeys.push(process.env[key]);
                }
            }
            
            // Then check the .env file for multiple keys
            try {
                const fs = require('fs');
                const path = require('path');
                const envPath = path.join(__dirname, '..', '.env');
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
            } catch (e) {
                // Ignore fs errors
            }
            
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
                    const shortKey = apiKey.substring(0, 10) + '...';
                    console.log(`[WhatsApp] 🔑 Trying API key (${shortKey}) [${i + 1}/${activeKeys.length}]`);
                    
                    try {
                        const apiRes = await global.fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{ text: `You are Ambi, Pranav's personal AI assistant. Always politely introduce yourself as Pranav's AI assistant answering on his behalf. You received a WhatsApp from ${senderName}: "${messageBody}". Write a short, friendly Hinglish reply without quotes.` }]
                                }]
                            })
                        });

                        if (apiRes.status === 429 || apiRes.status === 403) {
                            console.log(`[WhatsApp] ⚠️ Key rate-limited (Status ${apiRes.status}). Putting in 10-second cooldown.`);
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
                            console.log(`[WhatsApp] ⚠️ Key failed. Reason: ${errorMsg}. Cooldown for 30s.`);
                            keyStatus[apiKey] = Date.now() + 30000;
                        }
                    } catch (e) {
                        console.log(`[WhatsApp] ⚠️ Key network error: ${e.message}. Cooldown for 30s.`);
                        keyStatus[apiKey] = Date.now() + 30000;
                    }
                }
            } else {
                console.log("[WhatsApp] No API Key found, using fallback reply.");
            }

            console.log(`[WhatsApp] 🤖 Auto-replying to ${senderName}: "${replyText}"`);
            const chat = await msg.getChat();
            await chat.sendMessage(replyText);
            console.log(`[WhatsApp] ✅ Auto-reply sent successfully!`);
        } catch (err) {
            console.error(`[WhatsApp] ❌ Failed to send auto-reply:`, err.message);
        }
    }, 2000); // 2 second delay to feel natural
});

client.initialize();

/**
 * Send a WhatsApp message to a contact by name using whatsapp-web.js.
 * @param {string} name    - Contact name as it appears in WhatsApp
 * @param {string} message - Message text to send
 * @param {string} [chatId] - Direct chat ID if replying
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function sendWhatsAppMessage(name, message, chatId) {
    if (!isReady) {
        return { success: false, message: 'WhatsApp client is not ready yet. Please ensure the QR code was scanned.' };
    }

    try {
        if (chatId) {
            try {
                console.log(`[WhatsApp] ✍️  Replying directly to Chat ID: ${chatId}`);
                const chat = await client.getChatById(chatId);
                await chat.sendMessage(message);
                console.log(`[WhatsApp] ✅ Message sent to "${name}": "${message}"`);
                return { success: true, message: `✅ Replied to "${name}" successfully.` };
            } catch (err) {
                console.log(`[WhatsApp] ⚠️  Direct Chat ID failed (${err.message}), falling back to name search...`);
                // Fall back to name search
            }
        }

        console.log(`[WhatsApp] 🔍 Searching for contact: "${name}" ...`);
        
        // Fetch all contacts
        const contacts = await client.getContacts();
        
        // Find by name (case-insensitive)
        let exactMatch = null;
        let partialMatch = null;
        
        for (const contact of contacts) {
            const cName = contact.name || contact.pushname || '';
            const cNumber = contact.number || '';
            
            const contactName = cName.toLowerCase();
            const searchName = name.toLowerCase();
            
            if (contactName === searchName || cNumber === searchName) {
                exactMatch = contact;
                break; // Exact match found
            }
            if ((contactName && contactName.includes(searchName)) || (cNumber && cNumber.includes(searchName))) {
                partialMatch = contact;
            }
        }
        
        const targetContact = exactMatch || partialMatch;
        
        if (!targetContact) {
             return { success: false, message: `❌ No contact found matching "${name}".` };
        }
        
        console.log(`[WhatsApp] ✅ Found contact: ${targetContact.name || targetContact.pushname} (${targetContact.id._serialized})`);
        console.log(`[WhatsApp] ✍️  Sending message...`);
        
        await client.sendMessage(targetContact.id._serialized, message);
        console.log(`[WhatsApp] ✅ Message sent to "${name}": "${message}"`);
        
        return {
            success: true,
            message: `✅ Message sent to "${targetContact.name || targetContact.pushname}" successfully.`,
        };
    } catch (error) {
        console.error('[WhatsApp] ❌ Error:', error);
        return {
            success: false,
            message: `❌ Failed: ${error.message}`,
        };
    }
}

module.exports = { sendWhatsAppMessage, client, messageEmitter };

// CLI usage handling
if (require.main === module) {
    const [, , name, ...msgParts] = process.argv;
    const message = msgParts.join(' ');
    
    // In CLI mode, wait a bit for it to be ready
    let attempts = 0;
    const checkReady = setInterval(() => {
        if (isReady) {
            clearInterval(checkReady);
            if (name && message) {
                sendWhatsAppMessage(name, message).then(res => {
                    console.log(res.message);
                    process.exit(res.success ? 0 : 1);
                });
            } else {
                console.log('Client ready, but no message provided in CLI arguments.');
                process.exit(0);
            }
        } else {
            attempts++;
            // Don't wait forever
            if (attempts > 30) { // 30 seconds
                clearInterval(checkReady);
                if (name && message) {
                    console.log('Timeout waiting for client to be ready (maybe QR scan needed). Please run without args first to scan QR.');
                    process.exit(1);
                }
            }
        }
    }, 1000);
}
