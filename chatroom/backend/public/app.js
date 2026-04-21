const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');
const usernameEl = document.getElementById('username');
const startBtn = document.getElementById('startBtn');
const messagesEl = document.getElementById('messages');
const sendForm = document.getElementById('sendForm');
const messageEl = document.getElementById('message');

const imageFileEl = document.getElementById('imageFile');
const uploadBtn = document.getElementById('uploadBtn');
const uploadInfoEl = document.getElementById('uploadInfo');
const uploadPreviewEl = document.getElementById('uploadPreview');
const uploadedImageEl = document.getElementById('uploadedImage');

const LAST_IMAGE_URL_KEY = 'chat:lastImageUrl';

let started = false;

function setConnStatus(connected) {
    connDot.classList.toggle('ok', connected);
    connText.textContent = connected ? 'connected' : 'disconnected';
}

function formatTime(ts) {
    try {
        return new Date(ts).toLocaleTimeString();
    } catch {
        return '';
    }
}

function humanBytes(n) {
    if (!Number.isFinite(n)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    while (n >= 1024 && idx < units.length - 1) {
        n /= 1024;
        idx++;
    }
    return `${n.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function appendSystem(text) {
    const div = document.createElement('div');
    div.className = 'msg system';

    const top = document.createElement('div');
    top.className = 'top';

    const sender = document.createElement('span');
    sender.className = 'sender';
    sender.textContent = 'system';

    const time = document.createElement('span');
    time.textContent = formatTime(Date.now());

    top.appendChild(sender);
    top.appendChild(time);

    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = String(text || '');

    div.appendChild(top);
    div.appendChild(body);

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessage({ sender, message, ts }) {
    const div = document.createElement('div');
    div.className = 'msg';

    const top = document.createElement('div');
    top.className = 'top';

    const senderEl = document.createElement('span');
    senderEl.className = 'sender';
    senderEl.textContent = String(sender || '');

    const timeEl = document.createElement('span');
    timeEl.textContent = formatTime(ts);

    top.appendChild(senderEl);
    top.appendChild(timeEl);

    const body = document.createElement('div');
    body.className = 'body';

    const text = typeof message === 'string' ? message : String(message || '');
    if (text.startsWith('IMAGE:')) {
        const url = text.slice('IMAGE:'.length).trim();
        // Only render images from our own API endpoint.
        if (url.startsWith('/api/images/')) {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = url;

            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Uploaded image';
            img.loading = 'lazy';
            img.style.marginTop = '8px';
            img.style.maxWidth = '100%';
            img.style.borderRadius = '12px';
            img.style.border = '1px solid rgba(255, 255, 255, 0.12)';

            body.appendChild(link);
            body.appendChild(img);
        } else {
            body.textContent = url;
        }
    } else {
        body.textContent = text;
    }

    div.appendChild(top);
    div.appendChild(body);

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setUploadInfo(text) {
    uploadInfoEl.textContent = text || '';
}

function showUploadPreview(url) {
    if (!url) {
        uploadPreviewEl.hidden = true;
        uploadedImageEl.removeAttribute('src');
        return;
    }
    uploadedImageEl.src = url;
    uploadPreviewEl.hidden = false;
}

async function uploadImage(file) {
    const fd = new FormData();
    fd.append('image', file, file.name);

    const res = await fetch('/api/images/upload', {
        method: 'POST',
        body: fd,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || `Upload failed (${res.status})`);
    }

    return data;
}

setConnStatus(false);
appendSystem('Connecting…');

const lastUrl = localStorage.getItem(LAST_IMAGE_URL_KEY);
if (lastUrl) {
    setUploadInfo(`Last uploaded image: ${lastUrl}`);
    showUploadPreview(lastUrl);
}

// Socket.IO client from CDN exposes global `io`.
const socket = io({
    transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
    setConnStatus(true);
    appendSystem('Connected. Enter a username, then Start.');
});

socket.on('disconnect', () => {
    setConnStatus(false);
    appendSystem('Disconnected.');
});

socket.on('connect_error', (err) => {
    setConnStatus(false);
    appendSystem(`Connection error: ${err?.message || err}`);
});

socket.on('session:state', (state) => {
    if (Array.isArray(state?.messages)) {
        messagesEl.innerHTML = '';
        state.messages.forEach(appendMessage);
    }
});

socket.on('message:new', (payload) => {
    appendMessage(payload);
});

socket.on('session:error', (err) => {
    appendSystem(err?.message || 'Session error');
});

startBtn.addEventListener('click', () => {
    const user = usernameEl.value.trim();

    if (!user) {
        appendSystem('Username is required.');
        return;
    }

    socket.emit('session:start', { user });
    started = true;
    appendSystem(`Started as ${user}.`);
    messageEl.focus();
});

sendForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!started) {
        appendSystem('Press Start first.');
        return;
    }

    const text = messageEl.value;
    if (!text || !text.trim()) return;

    socket.emit('message:send', { message: text });
    messageEl.value = '';
    messageEl.focus();
});

uploadBtn.addEventListener('click', async () => {
    const file = imageFileEl?.files?.[0];
    if (!file) {
        setUploadInfo('Pick an image first.');
        return;
    }

    uploadBtn.disabled = true;
    setUploadInfo('Uploading, compressing (Huffman), and verifying lossless round-trip…');

    try {
        const result = await uploadImage(file);
        const url = result?.url;
        const stats = result?.stats;

        if (url) {
            localStorage.setItem(LAST_IMAGE_URL_KEY, url);
            showUploadPreview(url);
        }

        if (stats) {
            const ratio = Number.isFinite(stats.compressionRatio) ? stats.compressionRatio : null;
            setUploadInfo(
                `Stored at ${url} • original ${humanBytes(stats.originalSize)} • compressed ${humanBytes(stats.compressedSize)} • ratio ${ratio ? ratio.toFixed(3) : 'n/a'} • lossless=${stats.lossless} • byteDiff=${stats.byteDiffCount} • sha256Match=${stats.sha256Match}`
            );
        } else {
            setUploadInfo(`Stored at ${url}`);
        }

        if (started && url) {
            socket.emit('message:send', { message: `IMAGE:${url}` });
        } else if (url) {
            appendSystem('Image uploaded. Press Start to send it as a chat message.');
        }
    } catch (err) {
        setUploadInfo(err?.message || 'Upload failed.');
    } finally {
        uploadBtn.disabled = false;
    }
});
