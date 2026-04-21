const conversations = new Map();

function getOrCreate(conversationId) {
  const existing = conversations.get(conversationId);
  if (existing) return existing;

  const created = {
    messages: [], // { sender, message, ts }
  };
  conversations.set(conversationId, created);
  return created;
}

export function addMessage(conversationId, { sender, message, ts = Date.now() } = {}) {
  if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
    throw new Error('conversationId is required.');
  }
  if (typeof sender !== 'string' || sender.trim().length === 0) {
    throw new Error('Sender is required.');
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Message is required.');
  }

  const convo = getOrCreate(conversationId);
  const payload = {
    sender: sender.trim(),
    message: message.trim(),
    ts,
  };

  convo.messages.push(payload);
  return payload;
}

export function getState(conversationId) {
  const convo = getOrCreate(conversationId);
  return {
    conversationId,
    messages: convo.messages,
  };
}

export function clear(conversationId) {
  conversations.delete(conversationId);
}

export default { addMessage, getState, clear };
