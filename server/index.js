// server/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint (for UptimeRobot / Keep-Alive Pingers)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Real-Time Whiteboard Server is live' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Store canvas state, sticky notes, and text labels per room in memory
const roomState = {};
const roomStickies = {};
const roomTexts = {};
const roomUserCount = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join session/room
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;

    // Initialize room state and user count
    if (!roomState[roomId]) roomState[roomId] = [];
    if (!roomStickies[roomId]) roomStickies[roomId] = [];
    if (!roomTexts[roomId]) roomTexts[roomId] = [];
    if (!roomUserCount[roomId]) roomUserCount[roomId] = 0;
    
    roomUserCount[roomId]++;

    // Send current state to newly joined user
    socket.emit('init-canvas', {
      lines: roomState[roomId],
      stickies: roomStickies[roomId],
      texts: roomTexts[roomId],
    });

    socket.to(roomId).emit('user-joined', { userId: socket.id, username });
  });

  // Line drawing
  socket.on('draw-line', (line) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    if (!roomState[roomId]) roomState[roomId] = [];
    roomState[roomId].push(line);
    socket.to(roomId).emit('draw-line', line);
  });

  // Laser Pointer drawing (real-time ephemeral broadcast)
  socket.on('draw-laser', (laserLine) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('draw-laser', laserLine);
  });

  // Sticky Notes Sync
  socket.on('add-sticky', (sticky) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    if (!roomStickies[roomId]) roomStickies[roomId] = [];
    roomStickies[roomId].push(sticky);
    socket.to(roomId).emit('add-sticky', sticky);
  });

  socket.on('update-sticky', (updatedSticky) => {
    const roomId = socket.data.roomId;
    if (!roomId || !roomStickies[roomId]) return;
    roomStickies[roomId] = roomStickies[roomId].map((s) =>
      s.id === updatedSticky.id ? updatedSticky : s
    );
    socket.to(roomId).emit('update-sticky', updatedSticky);
  });

  socket.on('delete-sticky', (stickyId) => {
    const roomId = socket.data.roomId;
    if (!roomId || !roomStickies[roomId]) return;
    roomStickies[roomId] = roomStickies[roomId].filter((s) => s.id !== stickyId);
    socket.to(roomId).emit('delete-sticky', stickyId);
  });

  // Standalone Canvas Text Sync
  socket.on('add-text', (textObj) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    if (!roomTexts[roomId]) roomTexts[roomId] = [];
    roomTexts[roomId].push(textObj);
    socket.to(roomId).emit('add-text', textObj);
  });

  socket.on('update-text', (updatedText) => {
    const roomId = socket.data.roomId;
    if (!roomId || !roomTexts[roomId]) return;
    roomTexts[roomId] = roomTexts[roomId].map((t) =>
      t.id === updatedText.id ? updatedText : t
    );
    socket.to(roomId).emit('update-text', updatedText);
  });

  socket.on('delete-text', (textId) => {
    const roomId = socket.data.roomId;
    if (!roomId || !roomTexts[roomId]) return;
    roomTexts[roomId] = roomTexts[roomId].filter((t) => t.id !== textId);
    socket.to(roomId).emit('delete-text', textId);
  });

  // Load Template (bulk state sync)
  socket.on('load-template', ({ lines, stickies, texts }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    roomState[roomId] = lines || [];
    roomStickies[roomId] = stickies || [];
    roomTexts[roomId] = texts || [];
    socket.to(roomId).emit('init-canvas', {
      lines: roomState[roomId],
      stickies: roomStickies[roomId],
      texts: roomTexts[roomId],
    });
  });

  // Cursor movements
  socket.on('cursor-move', (pos) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit('cursor-move', {
      userId: socket.id,
      username: socket.data.username || 'Anonymous',
      x: pos.x,
      y: pos.y,
    });
  });

  // Live Emoji Reaction Bursts
  socket.on('send-emoji-burst', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    io.to(roomId).emit('receive-emoji-burst', {
      id: `emoji-${Date.now()}-${Math.random()}`,
      username: socket.data.username || 'Anonymous',
      emoji: data.emoji,
      x: data.x,
      y: data.y,
    });
  });

  // Chat Messages
  socket.on('send-chat-message', (messageText) => {
    const roomId = socket.data.roomId;
    const username = socket.data.username || 'Anonymous';
    if (!roomId) return;

    const msgPayload = {
      id: `msg-${Date.now()}`,
      username,
      text: messageText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    io.to(roomId).emit('receive-chat-message', msgPayload);
  });

  // Clear Canvas
  socket.on('clear-canvas', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    roomState[roomId] = [];
    roomStickies[roomId] = [];
    roomTexts[roomId] = [];
    socket.to(roomId).emit('clear-canvas');
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit('user-disconnected', socket.id);
      
      // Decrement user count
      if (roomUserCount[roomId]) {
        roomUserCount[roomId]--;
        
        // Clear room state when last user leaves
        if (roomUserCount[roomId] === 0) {
          console.log(`Last user left room ${roomId}, clearing state`);
          delete roomState[roomId];
          delete roomStickies[roomId];
          delete roomUserCount[roomId];
        }
      }
    }
  });
});

// Configure Nodemailer transporter
let transporter;

async function initTransporter() {
  if (process.env.SMTP_HOST) {
    console.log('Using configured SMTP settings for mail.');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    console.log('No SMTP configuration found. Generating test Ethereal account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log(`Generated Ethereal Test Account: User: ${testAccount.user}, Pass: ${testAccount.pass}`);
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (err) {
      console.error('Failed to create Ethereal test account:', err);
    }
  }
}

initTransporter();

// API endpoint to send emails
app.post('/api/send-invite', async (req, res) => {
  const { email, roomId, inviteLink } = req.body;

  if (!email || !roomId || !inviteLink) {
    return res.status(400).json({ error: 'Missing required parameters: email, roomId, inviteLink' });
  }

  // Basic email regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  if (!transporter) {
    return res.status(500).json({ error: 'Mail transporter not initialized' });
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Interactive Whiteboard" <no-reply@example.com>',
    to: email,
    subject: 'Join my whiteboard session',
    text: `You have been invited to join an interactive whiteboard session.\n\nClick this link to join: ${inviteLink}\n\nRoom ID: ${roomId}\n\nEnjoy collaborating!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0d6efd; text-align: center;">Interactive Whiteboard Invite</h2>
        <p>Hello,</p>
        <p>You have been invited to join a collaborative live whiteboard session.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #0d6efd; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Join Whiteboard Session</a>
        </div>
        <p style="font-size: 0.9em; color: #666;">
          <strong>Room ID:</strong> <code>${roomId}</code><br>
          If the button above does not work, copy and paste this URL into your browser:<br>
          <a href="${inviteLink}">${inviteLink}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 0.8em; color: #999; text-align: center;">This is an automated invite. Please do not reply to this email.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    
    // If using Ethereal email, log the URL to preview the mail
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`Preview URL: ${previewUrl}`);
      return res.status(200).json({ 
        success: true, 
        messageId: info.messageId, 
        previewUrl: previewUrl,
        message: 'Email sent successfully via test account. Preview link available in console.' 
      });
    }

    return res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email. ' + error.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});