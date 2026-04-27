/**
 * index.js — WhatsApp Web Automation using whatsapp-web.js
 * Ambi-style: Uses direct APIs, fast, and saves session properly.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const messageEmitter = new EventEmitter();
const introducedContacts = new Set();

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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
    setTimeout(async () => {
        try {
            const hasBeenIntroduced = introducedContacts.has(msg.from);
            if (!hasBeenIntroduced) {
                introducedContacts.add(msg.from);
            }
            const introInstruction = hasBeenIntroduced 
                ? "" 
                : " ALWAYS start your reply by introducing yourself briefly as Pranav's personal AI assistant.";

            let replyText = hasBeenIntroduced
                ? "Abhi mera server kaafi busy hai kyunki main testing phase me hu. 🙏 Aap please 24 hours ke baad message karein!"
                : "Hello! Mai Ambi hu, Pranav ki personal AI assistant. 🌟\n\nThank you for reaching out! Abhi mera server kaafi busy hai kyunki main testing phase (free API) par chal rahi hu. Aap please 24 hours ke baad message karein! 🙏";
            
            // Robust API Key Extraction: Grab any Gemini API Key from process.env or ../.env
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

            console.log(`[WhatsApp] 🔑 Loaded ${apiKeys.length} unique API keys for auto-reply.`);

            if (apiKeys.length > 0) {
                // Shuffle keys for better load balancing
                apiKeys = apiKeys.sort(() => Math.random() - 0.5);
                
                let success = false;
                for (const apiKey of apiKeys) {
                    console.log(`[WhatsApp] 🔑 Attempting auto-reply with API key ending in ...${apiKey.slice(-4)}`);
                    
                    try {
                        // Using gemini-1.5-flash for reliability and speed in 2026
                        const apiRes = await global.fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{ text: `You are Ambi, Pranav's personal AI assistant. You received a WhatsApp from ${senderName}: "${messageBody}". Write a short, friendly Hinglish reply without quotes. Do not use emojis.${introInstruction}` }]
                                }]
                            })
                        });

                        const apiData = await apiRes.json();

                        if (apiRes.status === 429) {
                            console.log(`[WhatsApp] ⚠️ Quota exceeded for key ...${apiKey.slice(-4)}. Trying next key...`);
                            continue;
                        }

                        if (apiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
                            replyText = apiData.candidates[0].content.parts[0].text.trim();
                            success = true;
                            break; 
                        } else {
                            console.log(`[WhatsApp] ⚠️ API Response for key ...${apiKey.slice(-4)} did not contain text. Error: ${JSON.stringify(apiData.error || 'Unknown error')}`);
                        }
                    } catch (e) {
                        console.log(`[WhatsApp] ❌ Request failed for key ...${apiKey.slice(-4)}: ${e.message}`);
                    }
                }

                if (!success) {
                    console.log("[WhatsApp] ❌ All API keys failed or exhausted. Using fallback reply.");
                }
            } else {
                console.log("[WhatsApp] ❌ No API Key found, using fallback reply.");
            }

            console.log(`[WhatsApp] 🤖 Auto-replying to ${senderName}: "${replyText}"`);
            const chat = await msg.getChat();
            await chat.sendMessage(replyText);
            console.log(`[WhatsApp] ✅ Auto-reply sent successfully!`);
        } catch (err) {
            console.error(`[WhatsApp] ❌ Failed in auto-reply logic:`, err.message);
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

module.exports = { sendWhatsAppMessage, client, messageEmitter, introducedContacts };

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
