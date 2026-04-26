const express = require('express');
const cors = require('cors');
const { initClient, sendTelegramMessage, messageEmitter, introducedContacts } = require('./index');

const app = express();
const PORT = 4001;

app.use(cors());
app.use(express.json());

app.post('/send', async (req, res) => {
    const { name, message, chatId } = req.body;

    if (!name && !chatId) {
        return res.status(400).json({ success: false, message: 'Name or chatId is required' });
    }
    if (!message) {
        return res.status(400).json({ success: false, message: 'Message is required' });
    }

    console.log(`[API] Received request to send Telegram message to: ${name || chatId}`);
    
    const result = await sendTelegramMessage(name, message, chatId);
    
    if (result.success) {
        res.json(result);
    } else {
        res.status(500).json(result);
    }
});

app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log('[API] New client connected to SSE stream');

    res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);

    const handleNewMessage = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    messageEmitter.on('new_message', handleNewMessage);

    req.on('close', () => {
        console.log('[API] Client disconnected from SSE stream');
        messageEmitter.off('new_message', handleNewMessage);
    });
});

app.get('/stats', (req, res) => {
    res.json({ usersReached: introducedContacts.size });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'telegram-bot' });
});

app.listen(PORT, async () => {
    console.log(`[API] 🌐 Telegram Bot Server running at http://localhost:${PORT}`);
    console.log(`[API] 📡 SSE Stream available at http://localhost:${PORT}/stream`);
    
    try {
        await initClient();
    } catch (err) {
        console.error('[API] ❌ Failed to initialize Telegram client:', err);
    }
});
