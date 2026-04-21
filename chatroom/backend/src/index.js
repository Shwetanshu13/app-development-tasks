import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import websocket from './websocket.js';
import chatRoutes from './routes/chat.routes.js';

// Run the backend server (default: 3001)
const PORT = Number(process.env.PORT) || 3001;

const app = express();

app.use(cors());
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

const server = createServer(app);
websocket.attach(server);

app.use('/api', chatRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// Basic JSON error handler (covers multer limits, etc.)
app.use((err, req, res, next) => {
  if (!err) return next();

  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large.' });
  }

  const msg = typeof err?.message === 'string' ? err.message : 'Internal server error.';
  if (msg.toLowerCase().includes('only image uploads')) {
    return res.status(415).json({ error: 'Only image uploads are supported.' });
  }

  return res.status(500).json({ error: 'Internal server error.' });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  if (ips.length) {
    console.log('Open on your phone (same Wi-Fi):');
    for (const ip of ips) {
      console.log(`  http://${ip}:${PORT}/`);
    }
  }
});