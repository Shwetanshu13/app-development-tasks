import { Server } from 'socket.io';

import conversations from './store/conversations.js';
import { getBotReply } from './bot.js';

export function attach(server) {
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        const conversationId = socket.id;
        socket.data.conversationId = conversationId;

        socket.emit('session:state', conversations.getState(conversationId));

        socket.on('session:start', ({ user } = {}) => {
            if (!user || typeof user !== 'string' || user.trim().length === 0) {
                socket.emit('session:error', { code: 'invalid_user', message: 'Username is required.' });
                return;
            }

            socket.data.user = user.trim();

            // Send a greeting once per connection.
            const greeting = `Hi ${socket.data.user}! I’m your local chatbot. Say “hello”.`;
            conversations.addMessage(conversationId, { sender: 'bot', message: greeting });
            socket.emit('session:state', conversations.getState(conversationId));
        });

        socket.on('message:send', ({ message } = {}) => {
            const user = socket.data?.user;
            if (!user) {
                socket.emit('session:error', { code: 'not_started', message: 'Enter a username and press Start first.' });
                return;
            }

            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                return;
            }

            let userPayload;
            try {
                userPayload = conversations.addMessage(conversationId, { sender: user, message });
            } catch (error) {
                socket.emit('session:error', { code: 'message_failed', message: error?.message || 'Failed to send message.' });
                return;
            }

            socket.emit('message:new', userPayload);

            const replyText = getBotReply(message);
            setTimeout(() => {
                try {
                    const botPayload = conversations.addMessage(conversationId, { sender: 'bot', message: replyText });
                    socket.emit('message:new', botPayload);
                } catch (error) {
                    socket.emit('session:error', { code: 'bot_failed', message: error?.message || 'Bot failed to reply.' });
                }
            }, 150);
        });

        socket.on('disconnect', () => {
            conversations.clear(conversationId);
        });
    });

    return io;
}

export default { attach };