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
const voiceRooms = {};

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

    // Broadcast updated active guest/user count to the room
    io.to(roomId).emit('room-user-count', roomUserCount[roomId]);

    // Send current state to newly joined user
    socket.emit('init-canvas', {
      lines: roomState[roomId],
      stickies: roomStickies[roomId],
      texts: roomTexts[roomId],
      userCount: roomUserCount[roomId],
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

  // --- Live Voice Chat Engine (Audio Streaming & WebRTC Hybrid Relay) ---
  const handleVoiceLeave = () => {
    const roomId = socket.data.roomId;
    if (!roomId || !voiceRooms[roomId] || !voiceRooms[roomId][socket.id]) return;

    delete voiceRooms[roomId][socket.id];
    if (Object.keys(voiceRooms[roomId]).length === 0) {
      delete voiceRooms[roomId];
    }

    const remainingUsers = voiceRooms[roomId]
      ? Object.entries(voiceRooms[roomId]).map(([id, info]) => ({
          socketId: id,
          username: info.username,
          isMuted: info.isMuted,
          isDeafened: info.isDeafened,
        }))
      : [];

    // Inform all clients in the room of updated participant list
    io.to(roomId).emit('voice-all-users', remainingUsers);
    socket.to(roomId).emit('voice-user-left', socket.id);
  };

  socket.on('voice-join', () => {
    const roomId = socket.data.roomId;
    const username = socket.data.username || 'Anonymous';
    if (!roomId) return;

    if (!voiceRooms[roomId]) {
      voiceRooms[roomId] = {};
    }

    // Register user in active voice room
    voiceRooms[roomId][socket.id] = {
      username,
      isMuted: false,
      isDeafened: false,
    };

    // List of all participants in this voice room
    const allUsers = Object.entries(voiceRooms[roomId]).map(([id, info]) => ({
      socketId: id,
      username: info.username,
      isMuted: info.isMuted,
      isDeafened: info.isDeafened,
    }));

    // Broadcast full updated list to all users in the room
    io.to(roomId).emit('voice-all-users', allUsers);
  });

  // Real-time live audio chunk relay (works across strict 4G/5G mobile CGNATs, firewalls, and all networks)
  socket.on('voice-audio-chunk', (chunk) => {
    const roomId = socket.data.roomId;
    if (!roomId || !voiceRooms[roomId] || !voiceRooms[roomId][socket.id]) return;

    // Forward audio chunk to all other peers in the room
    socket.to(roomId).emit('voice-audio-chunk', {
      userId: socket.id,
      chunk,
    });
  });

  // WebRTC Signal & ICE relays
  socket.on('voice-signal', ({ target, signal }) => {
    io.to(target).emit('voice-signal', {
      caller: socket.id,
      signal,
    });
  });

  socket.on('voice-ice-candidate', ({ target, candidate }) => {
    io.to(target).emit('voice-ice-candidate', {
      caller: socket.id,
      candidate,
    });
  });

  // Broadcast Mute / Deafen status updates
  socket.on('voice-state-change', ({ isMuted, isDeafened }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !voiceRooms[roomId] || !voiceRooms[roomId][socket.id]) return;

    voiceRooms[roomId][socket.id].isMuted = isMuted;
    voiceRooms[roomId][socket.id].isDeafened = isDeafened;

    socket.to(roomId).emit('voice-user-state-changed', {
      socketId: socket.id,
      isMuted,
      isDeafened,
    });
  });

  socket.on('voice-leave', handleVoiceLeave);

  socket.on('disconnect', () => {
    handleVoiceLeave();
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit('user-disconnected', socket.id);
      
      // Decrement user count
      if (roomUserCount[roomId]) {
        roomUserCount[roomId]--;
        io.to(roomId).emit('room-user-count', roomUserCount[roomId]);
        
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

// Configure Nodemailer transporter (with timeout guards to prevent hanging on cloud hosts)
let transporter = null;

async function initTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    console.log('Using configured SMTP settings for mail delivery.');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_PORT === '465' || !process.env.SMTP_PORT, // default to 465 SSL
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });
  } else {
    console.log('No production SMTP settings found (SMTP_HOST/SMTP_USER). Using direct mailto client fallback.');
  }
}

initTransporter();

// Helper to generate professional HTML invite template
function getInviteHtml(roomId, inviteLink) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 6px; font-size: 22px;">You're Invited to CollabBoard!</h2>
        <p style="color: #64748b; font-size: 14px; margin: 0;">Real-time interactive collaborative whiteboard session</p>
      </div>
      <p style="font-size: 15px; line-height: 1.5;">Hello,</p>
      <p style="font-size: 15px; line-height: 1.5;">A collaborator has invited you to join a live whiteboard session in room <strong>${roomId}</strong>.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
          Join Whiteboard Session &rarr;
        </a>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 13px; color: #475569;">
        <strong>Room Name:</strong> <code>${roomId}</code><br/>
        <strong>Direct Link:</strong> <a href="${inviteLink}" style="color: #4f46e5; word-break: break-all;">${inviteLink}</a>
      </div>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Sent via CollabBoard Real-Time Interactive Whiteboard.</p>
    </div>
  `;
}

// API endpoint to send emails (with Resend HTTPS, SMTP, and mailto fallback)
app.post('/api/send-invite', async (req, res) => {
  const { email, roomId, inviteLink } = req.body;

  if (!email || !roomId || !inviteLink) {
    return res.status(400).json({ error: 'Missing required parameters: email, roomId, inviteLink' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  const subject = `Join my whiteboard session (Room: ${roomId})`;
  const textBody = `Hello,\n\nYou have been invited to join a live whiteboard session.\n\nRoom ID: ${roomId}\nJoin Link: ${inviteLink}\n\nLooking forward to collaborating!`;
  const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textBody)}`;

  // 1. Try Brevo HTTPS API (300 free emails/day to ANY domain, port 443 HTTPS - never blocked)
  if (process.env.BREVO_API_KEY) {
    try {
      const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || 'invites@collabboard.app';
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'CollabBoard Whiteboard', email: senderEmail },
          to: [{ email }],
          subject,
          htmlContent: getInviteHtml(roomId, inviteLink),
        }),
      });

      const brevoData = await brevoResponse.json();
      if (brevoResponse.ok) {
        console.log(`Email sent via Brevo to ${email}:`, brevoData.messageId);
        return res.status(200).json({ success: true, message: `Invitation email delivered successfully to ${email}!` });
      } else {
        console.warn('Brevo error:', brevoData);
      }
    } catch (e) {
      console.warn('Brevo request failed:', e.message);
    }
  }

  // 2. Try Resend API over HTTPS (Port 443 - never blocked by Render / cloud providers)
  if (process.env.RESEND_API_KEY) {
    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SMTP_FROM || 'CollabBoard <onboarding@resend.dev>',
          to: [email],
          subject,
          text: textBody,
          html: getInviteHtml(roomId, inviteLink),
        }),
      });

      const resendData = await resendResponse.json();
      if (resendResponse.ok) {
        return res.status(200).json({ success: true, message: 'Invitation email delivered successfully via Resend!' });
      } else {
        console.warn('Resend error:', resendData);
      }
    } catch (e) {
      console.warn('Resend request failed:', e.message);
    }
  }

  // 2. Try configured SMTP transporter (with strict 6s timeout guard)
  if (transporter) {
    try {
      const sendPromise = transporter.sendMail({
        from: process.env.SMTP_FROM || `"CollabBoard" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        text: textBody,
        html: getInviteHtml(roomId, inviteLink),
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP connection timed out')), 6000)
      );

      const info = await Promise.race([sendPromise, timeoutPromise]);
      console.log(`Email sent via SMTP: ${info.messageId}`);
      return res.status(200).json({ success: true, message: 'Invitation email sent successfully!' });
    } catch (error) {
      console.warn('SMTP delivery failed or timed out:', error.message);
      return res.status(200).json({
        success: false,
        useMailto: true,
        mailtoUrl,
        error: 'Cloud SMTP port restricted on server. You can send directly using your email app below!',
      });
    }
  }

  // 3. Fallback: Return mailtoUrl so client opens native mail app directly
  return res.status(200).json({
    success: false,
    useMailto: true,
    mailtoUrl,
    error: 'No mail service credentials configured on server. Open directly in your email app below!',
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});