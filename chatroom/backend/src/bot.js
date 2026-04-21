function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[!?.,]/g, '')
    .replace(/\s+/g, ' ');
}

const RULES = [
  { match: ['hello', 'hi', 'hey'], reply: 'Hello! 👋' },
  { match: ['good morning'], reply: 'Good morning! How can I help?' },
  { match: ['good afternoon'], reply: 'Good afternoon! How’s your day going?' },
  { match: ['good evening'], reply: 'Good evening! What’s up?' },
  { match: ['how are you', 'how are you doing', 'hows it going'], reply: "I’m doing fine! How are you?" },
  { match: ['im fine', 'i am fine', 'im good', 'i am good'], reply: 'Nice! What are you up to?' },
  { match: ['whats your name', 'what is your name'], reply: 'I’m a simple local chatbot.' },
  { match: ['help'], reply: 'Try saying: hello, how are you, tell me a joke, or bye.' },
  { match: ['thanks', 'thank you', 'thx'], reply: 'You’re welcome!' },
  { match: ['bye', 'goodbye', 'see you'], reply: 'Bye! Talk to you later.' },
  { match: ['who made you', 'who created you'], reply: 'I’m a small hardcoded bot running on your localhost.' },
  { match: ['what can you do', 'what do you do'], reply: 'I can reply to a few simple phrases.' },
  { match: ['tell me a joke', 'joke'], reply: 'Why did the developer go broke? Because they used up all their cache.' },
  { match: ['lol', 'haha', 'lmao'], reply: 'Glad that was funny 😄' },
  { match: ['weather'], reply: "I can’t check live weather, but I hope it’s nice where you are." },
  { match: ['time'], reply: `On my side it’s ${new Date().toLocaleTimeString()}.` },
];

export function getBotReply(inputText) {
  const text = normalize(inputText);
  if (!text) return "Say something and I’ll reply.";

  for (const rule of RULES) {
    if (rule.match.includes(text)) {
      return typeof rule.reply === 'function' ? rule.reply() : rule.reply;
    }
  }

  // Light fuzzy: startsWith for common greetings/questions.
  if (text.startsWith('hello') || text.startsWith('hi') || text.startsWith('hey')) {
    return 'Hello! How can I help?';
  }
  if (text.startsWith('how are')) {
    return "I’m doing fine. How about you?";
  }

  return "I’m not sure how to respond to that. Try: 'hello' or 'tell me a joke'.";
}

export default { getBotReply };
