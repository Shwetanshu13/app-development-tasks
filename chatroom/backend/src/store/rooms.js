const rooms = new Map();

function normalizeRoomId(roomId) {
    if (typeof roomId !== 'string') return 'main';
    const trimmed = roomId.trim();
    return trimmed.length ? trimmed : 'main';
}

export function getOrCreateRoom(roomId) {
    roomId = normalizeRoomId(roomId);

    const existing = rooms.get(roomId);
    if (existing) return { roomId, room: existing };

    const created = {
        participants: new Map(), // key -> username
        messages: [], // { sender, message, ts }
    };

    rooms.set(roomId, created);
    return { roomId, room: created };
}

export function addParticipant(roomId, key, username, { maxParticipants = 2 } = {}) {
    if (typeof key !== 'string' || key.trim().length === 0) {
        throw new Error('Participant key is required.');
    }

    if (typeof username !== 'string' || username.trim().length === 0) {
        throw new Error('Username is required.');
    }

    username = username.trim();
    const { roomId: normalizedRoomId, room } = getOrCreateRoom(roomId);

    if (!room.participants.has(key) && room.participants.size >= maxParticipants) {
        const error = new Error('Room is full.');
        error.code = 'room_full';
        throw error;
    }

    room.participants.set(key, username);
    return { roomId: normalizedRoomId, participants: listParticipants(normalizedRoomId) };
}

export function removeParticipant(roomId, key) {
    roomId = normalizeRoomId(roomId);
    const room = rooms.get(roomId);
    if (!room) return { roomId, participants: [] };

    room.participants.delete(key);
    return { roomId, participants: listParticipants(roomId) };
}

export function listParticipants(roomId) {
    roomId = normalizeRoomId(roomId);
    const room = rooms.get(roomId);
    if (!room) return [];

    // Map preserves insertion order; also dedupe just in case.
    return Array.from(new Set(room.participants.values()));
}

export function addMessage(roomId, { sender, message, ts = Date.now() } = {}) {
    if (typeof sender !== 'string' || sender.trim().length === 0) {
        throw new Error('Sender is required.');
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('Message is required.');
    }

    const { roomId: normalizedRoomId, room } = getOrCreateRoom(roomId);

    const payload = {
        sender: sender.trim(),
        message: message.trim(),
        ts,
    };

    room.messages.push(payload);
    return { roomId: normalizedRoomId, message: payload };
}

export function getRoomState(roomId) {
    roomId = normalizeRoomId(roomId);
    const room = rooms.get(roomId);
    if (!room) {
        return { roomId, participants: [], messages: [] };
    }

    return {
        roomId,
        participants: listParticipants(roomId),
        messages: room.messages,
    };
}

export function getMessages(roomId) {
    roomId = normalizeRoomId(roomId);
    const room = rooms.get(roomId);
    return room ? room.messages : [];
}

export default {
    getOrCreateRoom,
    addParticipant,
    removeParticipant,
    listParticipants,
    addMessage,
    getRoomState,
    getMessages,
};
