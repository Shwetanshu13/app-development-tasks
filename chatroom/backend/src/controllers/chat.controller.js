import { getBotReply } from '../bot.js';

export const botReply = (req, res) => {
    const { message } = req.body;
    if (typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    res.status(200).json({ reply: getBotReply(message) });
};

export const botHealth = (req, res) => {
    res.status(200).json({ ok: true, bot: 'hardcoded' });
};

