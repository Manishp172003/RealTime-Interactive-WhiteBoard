// src/components/Whiteboard.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Group, Circle, Text, Rect } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import { jsPDF } from 'jspdf';
import keycloak from '../keycloak';
import { 
  Palette, 
  Copy, 
  Check, 
  Mail, 
  MessageSquare, 
  Download, 
  User, 
  LogOut, 
  Moon, 
  Sun, 
  Play, 
  Image as ImageIcon, 
  FileDown, 
  Video, 
  Pen, 
  Highlighter, 
  Eraser, 
  StickyNote, 
  Undo2, 
  Redo2, 
  Trash2,
  X
} from 'lucide-react';

export interface LineData {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  strokeWidth: number;
  points: number[];
}

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

interface UserCursor {
  userId: string;
  username: string;
  x: number;
  y: number;
  color: string;
}

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  time: string;
}

interface EmojiBurst {
  id: string;
  username: string;
  emoji: string;
  x: number;
  y: number;
}

interface WhiteboardProps {
  username: string;
  initialRoomId?: string;
}

const SOCKET_SERVER_URL = 'http://localhost:5000';

export const Whiteboard: React.FC<WhiteboardProps> = ({ username, initialRoomId }) => {
  const [lines, setLines] = useState<LineData[]>([]);
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'sticky'>('pen');
  const [color, setColor] = useState<string>('#0f172a');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [roomId, setRoomId] = useState<string>(initialRoomId || 'main-room');
  const [inputRoomId, setInputRoomId] = useState<string>(initialRoomId || 'main-room');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, UserCursor>>({});
  const [emojiBursts, setEmojiBursts] = useState<EmojiBurst[]>([]);

  // Replay State
  const [isReplaying, setIsReplaying] = useState<boolean>(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState<string>('');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState<boolean>(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [chatWidth, setChatWidth] = useState<number>(320);
  const [isResizingChat, setIsResizingChat] = useState<boolean>(false);
  
  // Undo/Redo State
  const [redoStack, setRedoStack] = useState<LineData[][]>([]);
  
  // Invitation State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Sticky Note Editing State
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingStickyText, setEditingStickyText] = useState<string>('');
  const [editingStickyPos, setEditingStickyPos] = useState<{ x: number; y: number } | null>(null);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const isDrawing = useRef<boolean>(false);
  const stageRef = useRef<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastCursorEmit = useRef<number>(0);
  const currentCursorPos = useRef<{ x: number; y: number }>({ x: 200, y: 200 });
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const presetColors = ['#0f172a', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea'];

  // Theme Management
  useEffect(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      // Fall back to system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const systemTheme = prefersDark ? 'dark' : 'light';
      setTheme(systemTheme);
      document.documentElement.setAttribute('data-theme', systemTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.emit('join-room', { roomId, username });

    socket.on('init-canvas', (data: { lines: LineData[]; stickies: StickyNote[] }) => {
      setLines(data.lines || []);
      setStickies(data.stickies || []);
    });

    socket.on('draw-line', (newLine: LineData) => {
      setLines((prev) => [...prev, newLine]);
    });

    socket.on('add-sticky', (newSticky: StickyNote) => {
      setStickies((prev) => [...prev, newSticky]);
    });

    socket.on('update-sticky', (updatedSticky: StickyNote) => {
      setStickies((prev) => prev.map((s) => (s.id === updatedSticky.id ? updatedSticky : s)));
    });

    socket.on('delete-sticky', (stickyId: string) => {
      setStickies((prev) => prev.filter((s) => s.id !== stickyId));
    });

    socket.on('cursor-move', (cursorData: UserCursor) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [cursorData.userId]: {
          ...cursorData,
          color: cursorData.color || '#ef4444',
        },
      }));
    });

    socket.on('receive-emoji-burst', (burst: EmojiBurst) => {
      setEmojiBursts((prev) => [...prev, burst]);
      setTimeout(() => {
        setEmojiBursts((prev) => prev.filter((b) => b.id !== burst.id));
      }, 2000);
    });

    socket.on('receive-chat-message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
      if (!isChatOpen) {
        setUnreadCount((c) => c + 1);
      }
    });

    socket.on('user-disconnected', (userId: string) => {
      setRemoteCursors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    socket.on('clear-canvas', () => {
      setLines([]);
      setStickies([]);
      setRedoStack([]);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, username]);

  // Sync inputRoomId when active roomId changes
  useEffect(() => {
    setInputRoomId(roomId);
  }, [roomId]);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };

    if (isExportDropdownOpen || isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExportDropdownOpen, isProfileDropdownOpen]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lines, redoStack]);

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (tool === 'sticky') {
      const newSticky: StickyNote = {
        id: `sticky-${Date.now()}`,
        x: pos.x - 60,
        y: pos.y - 60,
        text: 'Double click to edit',
        color: '#fef08a',
      };
      setStickies((prev) => [...prev, newSticky]);
      if (socketRef.current) socketRef.current.emit('add-sticky', newSticky);
      setTool('pen');
      return;
    }

    isDrawing.current = true;
    const strokeColor = tool === 'eraser' ? '#f8fafc' : tool === 'highlighter' ? `${color}80` : color;
    const width = tool === 'highlighter' ? strokeWidth * 3 : strokeWidth;

    const newLine: LineData = {
      id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      tool,
      color: strokeColor,
      strokeWidth: width,
      points: [pos.x, pos.y],
    };

    setLines((prev) => [...prev, newLine]);
    setRedoStack([]);
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    if (!point) return;

    currentCursorPos.current = { x: point.x, y: point.y };

    const now = Date.now();
    if (now - lastCursorEmit.current > 30 && socketRef.current) {
      socketRef.current.emit('cursor-move', { x: point.x, y: point.y });
      lastCursorEmit.current = now;
    }

    if (!isDrawing.current) return;

    setLines((prevLines) => {
      if (prevLines.length === 0) return prevLines;
      const lastLine = { ...prevLines[prevLines.length - 1] };
      lastLine.points = lastLine.points.concat([point.x, point.y]);
      return [...prevLines.slice(0, -1), lastLine];
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (lines.length > 0 && socketRef.current) {
      const lastLine = lines[lines.length - 1];
      socketRef.current.emit('draw-line', lastLine);
    }
  };

  const handleStartReplay = () => {
    if (lines.length === 0 || isReplaying) return;
    setIsReplaying(true);
    const fullHistory = [...lines];
    setLines([]);

    let index = 0;
    const interval = setInterval(() => {
      if (index >= fullHistory.length) {
        clearInterval(interval);
        setIsReplaying(false);
      } else {
        setLines((prev) => [...prev, fullHistory[index]]);
        index++;
      }
    }, 150);
  };

  const handleExportPNG = () => {
    if (!stageRef.current) return;
    const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}-${Date.now()}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const img = new Image();
    img.src = dataURL;
    img.onload = () => {
      const pxToMm = 0.264583;
      const widthMm = dimensions.width * pxToMm;
      const heightMm = dimensions.height * pxToMm;
      const pdf = new jsPDF({
        orientation: dimensions.width > dimensions.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [widthMm, heightMm],
      });
      pdf.addImage(dataURL, 'PNG', 0, 0, widthMm, heightMm);
      pdf.save(`whiteboard-${roomId}-${Date.now()}.pdf`);
    };
  };

  const handleExportVideo = () => {
    const stage = stageRef.current;
    if (!stage || lines.length === 0) return;

    // Create a canvas for recording
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use MediaRecorder API
    const stream = canvas.captureStream(30); // 30 FPS
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
    });
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whiteboard-${roomId}-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();

    // Animate drawing for video
    let currentLineIndex = 0;
    let currentPointIndex = 0;
    const animationSpeed = 2; // Points per frame

    const animate = () => {
      // Clear canvas
      ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw completed lines
      for (let i = 0; i < currentLineIndex; i++) {
        const line = lines[i];
        if (!line || !line.points) continue;
        
        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (line.tool === 'highlighter') {
          ctx.globalAlpha = 0.3;
        } else {
          ctx.globalAlpha = 1;
        }

        if (line.points.length > 0) {
          ctx.moveTo(line.points[0], line.points[1]);
          for (let j = 2; j < line.points.length; j += 2) {
            ctx.lineTo(line.points[j], line.points[j + 1]);
          }
        }
        ctx.stroke();
      }

      // Draw current line being animated
      if (currentLineIndex < lines.length) {
        const currentLine = lines[currentLineIndex];
        if (currentLine && currentLine.points) {
          ctx.beginPath();
          ctx.strokeStyle = currentLine.color;
          ctx.lineWidth = currentLine.strokeWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          if (currentLine.tool === 'highlighter') {
            ctx.globalAlpha = 0.3;
          } else {
            ctx.globalAlpha = 1;
          }

          if (currentLine.points.length > 0) {
            ctx.moveTo(currentLine.points[0], currentLine.points[1]);
            for (let j = 2; j <= currentPointIndex * 2 && j < currentLine.points.length; j += 2) {
              ctx.lineTo(currentLine.points[j], currentLine.points[j + 1]);
            }
          }
          ctx.stroke();

          // Advance point index
          currentPointIndex += animationSpeed;
          if (currentPointIndex * 2 >= currentLine.points.length) {
            currentPointIndex = 0;
            currentLineIndex++;
          }
        }
      }

      // Continue animation or stop
      if (currentLineIndex < lines.length) {
        requestAnimationFrame(animate);
      } else {
        // Draw sticky notes at the end
        stickies.forEach((sticky) => {
          ctx.fillStyle = sticky.color;
          ctx.fillRect(sticky.x, sticky.y, 120, 120);
          ctx.fillStyle = '#000';
          ctx.font = '14px Arial';
          ctx.fillText(sticky.text, sticky.x + 10, sticky.y + 20);
        });

        // Stop recording after a short delay
        setTimeout(() => {
          mediaRecorder.stop();
        }, 500);
      }
    };

    animate();
  };

  const handleUndo = () => {
    if (lines.length === 0) return;
    // Save current state to redo stack
    setRedoStack((prev) => [...prev, [...lines]]);
    // Remove last line
    setLines((prev) => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const previousState = redoStack[redoStack.length - 1];
    setLines([...previousState]);
    setRedoStack((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (lines.length === 0 && stickies.length === 0) return;
    setLines([]);
    setStickies([]);
    setRedoStack([]);
    if (socketRef.current) socketRef.current.emit('clear-canvas');
  };

  const handleCopyRoom = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteEmail('');
    setEmailStatus(null);
    setIsSendingEmail(false);
  };

  const handleInvite = async () => {
    const inviteLink = `${window.location.origin}?room=${roomId}`;
    if (inviteEmail) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inviteEmail.trim())) {
        setEmailStatus({ type: 'error', message: 'Please enter a valid email address.' });
        return;
      }

      setIsSendingEmail(true);
      setEmailStatus(null);

      try {
        const response = await fetch('http://localhost:5000/api/send-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: inviteEmail.trim(),
            roomId,
            inviteLink,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          setEmailStatus({ 
            type: 'success', 
            message: data.previewUrl 
              ? 'Invitation sent via test account. Preview link logged to console.' 
              : 'Invitation email sent successfully!' 
          });
          
          if (data.previewUrl) {
            console.log('Ethereal Mail Preview URL:', data.previewUrl);
          }

          setTimeout(() => {
            closeInviteModal();
          }, 3000);
        } else {
          setEmailStatus({ type: 'error', message: data.error || 'Failed to send invitation email.' });
        }
      } catch (err: any) {
        console.error('Error sending invite email:', err);
        setEmailStatus({ type: 'error', message: 'Could not connect to the server to send email.' });
      } finally {
        setIsSendingEmail(false);
      }
    } else {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      closeInviteModal();
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !socketRef.current) return;
    socketRef.current.emit('send-chat-message', messageInput.trim());
    setMessageInput('');
  };

  // Sticky Note Handlers
  const handleStickyDoubleClick = (sticky: StickyNote) => {
    setEditingStickyId(sticky.id);
    setEditingStickyText(sticky.text);
    setEditingStickyPos({ x: sticky.x, y: sticky.y });
  };

  const handleStickySave = () => {
    if (!editingStickyId || !socketRef.current) return;
    
    const updatedSticky = stickies.find(s => s.id === editingStickyId);
    if (!updatedSticky) return;

    const newSticky = { ...updatedSticky, text: editingStickyText };
    setStickies(prev => prev.map(s => s.id === editingStickyId ? newSticky : s));
    socketRef.current.emit('update-sticky', newSticky);
    
    setEditingStickyId(null);
    setEditingStickyText('');
    setEditingStickyPos(null);
  };

  const handleStickyCancel = () => {
    setEditingStickyId(null);
    setEditingStickyText('');
    setEditingStickyPos(null);
  };

  const handleStickyDragEnd = (e: any, sticky: StickyNote) => {
    const newX = e.target.x();
    const newY = e.target.y();
    
    const updatedSticky = { ...sticky, x: newX, y: newY };
    setStickies(prev => prev.map(s => s.id === sticky.id ? updatedSticky : s));
    
    if (socketRef.current) {
      socketRef.current.emit('update-sticky', updatedSticky);
    }
  };

  const handleStickyDelete = (stickyId: string) => {
    setStickies(prev => prev.filter(s => s.id !== stickyId));
    if (socketRef.current) {
      socketRef.current.emit('delete-sticky', stickyId);
    }
  };

  // Chat Resize Handlers
  const handleChatResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingChat(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingChat) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 250 && newWidth <= 600) {
        setChatWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingChat(false);
    };

    if (isResizingChat) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingChat]);

  return (
    <div className="position-relative w-100 vh-100 overflow-hidden canvas-grid-bg">
      {/* Top Header Bar */}
      <header className="position-absolute top-0 start-0 end-0 p-2 p-md-3 z-3 d-flex justify-content-between align-items-center pointer-events-none flex-wrap gap-2">
        {/* Left Unified Session Panel */}
        <div className="d-flex align-items-center gap-2 pointer-events-auto">
          <div className="glass-panel px-2 px-md-3 py-2 rounded-4 d-flex align-items-center gap-2 gap-md-3">
            <div className="d-flex align-items-center gap-2">
              <Palette size={20} className="text-primary" />
              <span className="fw-bold text-slate-800 fs-6 d-none d-sm-inline">Whiteboard</span>
            </div>

            <div className="vr opacity-25 d-none d-sm-block" />

            <div className="d-flex align-items-center gap-1 gap-md-2">
              <small className="text-muted fw-semibold d-none d-sm-inline">Room:</small>
              <input
                type="text"
                className="room-input rounded-3 fw-medium px-2 py-0"
                style={{ width: '90px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)' }}
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const trimmed = inputRoomId.trim();
                    if (trimmed && trimmed !== roomId) {
                      setRoomId(trimmed);
                    }
                  }
                }}
                title="Type room name and press Enter or click Join"
              />
              {inputRoomId.trim() !== roomId && (
                <button
                  className="btn btn-sm btn-primary py-0 px-2 rounded-3 d-flex align-items-center justify-content-center"
                  style={{ fontSize: '11px', height: '22px' }}
                  onClick={() => {
                    const trimmed = inputRoomId.trim();
                    if (trimmed) {
                      setRoomId(trimmed);
                    }
                  }}
                >
                  Join
                </button>
              )}
              <button
                className="btn btn-sm btn-light border-0 rounded-circle p-1 d-flex align-items-center justify-content-center"
                onClick={handleCopyRoom}
                title="Copy Room ID"
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>

            <div className="vr opacity-25" />

            <div className="d-flex align-items-center gap-1">
              <span
                className={`rounded-circle ${isConnected ? 'bg-success' : 'bg-danger'}`}
                style={{ width: '8px', height: '8px' }}
              />
              <small className="fw-semibold text-secondary d-none d-md-inline" style={{ fontSize: '12px' }}>
                {isConnected ? 'Live' : 'Connecting'}
              </small>
            </div>
          </div>
        </div>

        {/* Right Consolidated Action Bar */}
        <div className="d-flex align-items-center gap-2 pointer-events-auto">
          {/* Invite Button */}
          <button
            className="btn btn-primary p-2 px-3 rounded-4 d-flex align-items-center gap-2 shadow-sm"
            onClick={() => setIsInviteModalOpen(true)}
            title="Invite users"
          >
            <Mail size={16} />
            <span className="fw-semibold small d-none d-sm-inline">Invite</span>
          </button>

          {/* Chat Button */}
          <button
            className="glass-panel btn position-relative p-2 px-3 rounded-4 d-flex align-items-center gap-2"
            onClick={() => {
              setIsChatOpen(!isChatOpen);
              setUnreadCount(0);
            }}
            title="Live Chat"
          >
            <MessageSquare size={16} />
            <span className="fw-semibold text-slate-700 small d-none d-md-inline">Chat</span>
            {unreadCount > 0 && (
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Export Dropdown */}
          <div className="position-relative" ref={exportDropdownRef}>
            <button
              className="glass-panel btn p-2 px-3 rounded-4 d-flex align-items-center gap-2"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              title="Export Whiteboard"
            >
              <Download size={16} />
              <span className="fw-semibold text-slate-700 small d-none d-md-inline">Export</span>
              <span className="small text-secondary" style={{ fontSize: '10px' }}>▼</span>
            </button>
            {isExportDropdownOpen && (
              <div className="position-absolute top-100 end-0 mt-2 glass-panel shadow-lg border rounded-3 overflow-hidden" style={{ minWidth: '200px', zIndex: 1000 }}>
                <button
                  className="w-100 export-dropdown-item text-start px-3 py-2 border-0 small d-flex align-items-center gap-2"
                  onClick={() => {
                    handleExportPNG();
                    setIsExportDropdownOpen(false);
                  }}
                >
                  <ImageIcon size={16} className="text-secondary" />
                  <span>Export as PNG Image</span>
                </button>
                <button
                  className="w-100 export-dropdown-item text-start px-3 py-2 border-0 small d-flex align-items-center gap-2"
                  onClick={() => {
                    handleExportPDF();
                    setIsExportDropdownOpen(false);
                  }}
                >
                  <FileDown size={16} className="text-secondary" />
                  <span>Export as PDF Document</span>
                </button>
                <button
                  className="w-100 export-dropdown-item text-start px-3 py-2 border-0 small d-flex align-items-center gap-2"
                  onClick={() => {
                    handleExportVideo();
                    setIsExportDropdownOpen(false);
                  }}
                  disabled={lines.length === 0}
                >
                  <Video size={16} className="text-secondary" />
                  <span>Export as Video (WebM)</span>
                </button>
              </div>
            )}
          </div>

          {/* User Profile & Settings Dropdown */}
          <div className="position-relative" ref={profileDropdownRef}>
            <button
              className="glass-panel btn p-2 px-3 rounded-4 d-flex align-items-center gap-2"
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              title="User Profile & Settings"
            >
              <User size={16} className="text-primary" />
              <span className="fw-semibold text-primary small d-none d-sm-inline">{username}</span>
              <span className="small text-secondary" style={{ fontSize: '10px' }}>▼</span>
            </button>
            {isProfileDropdownOpen && (
              <div className="position-absolute top-100 end-0 mt-2 glass-panel shadow-lg border rounded-3 overflow-hidden" style={{ minWidth: '220px', zIndex: 1000 }}>
                <div className="px-3 py-2 border-bottom bg-light bg-opacity-25">
                  <small className="text-muted d-block" style={{ fontSize: '11px' }}>Signed in as</small>
                  <strong className="text-slate-800 text-truncate d-block">{username}</strong>
                </div>

                <div className="py-1">
                  <button
                    className="w-100 btn btn-link text-decoration-none text-start px-3 py-2 small d-flex justify-content-between align-items-center text-body border-0"
                    onClick={() => {
                      toggleTheme();
                    }}
                  >
                    <span className="d-flex align-items-center gap-2">
                      {theme === 'light' ? <Moon size={16} className="text-secondary" /> : <Sun size={16} className="text-warning" />}
                      <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                    </span>
                    <span className="badge bg-secondary bg-opacity-10 text-secondary rounded-pill uppercase" style={{ fontSize: '10px' }}>
                      {theme}
                    </span>
                  </button>

                  <button
                    className="w-100 btn btn-link text-decoration-none text-start px-3 py-2 small d-flex align-items-center gap-2 text-body border-0"
                    onClick={() => {
                      handleStartReplay();
                      setIsProfileDropdownOpen(false);
                    }}
                    disabled={isReplaying || lines.length === 0}
                  >
                    <Play size={16} className="text-secondary" />
                    <span>Replay Canvas</span>
                  </button>
                </div>

                <div className="border-top py-1">
                  <button
                    className="w-100 btn btn-link text-decoration-none text-start px-3 py-2 small d-flex align-items-center gap-2 text-danger border-0"
                    onClick={() => keycloak.logout()}
                  >
                    <LogOut size={16} />
                    <span className="fw-semibold">Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Floating Bottom Toolbar Dock */}
      <div className="position-absolute bottom-0 start-50 translate-middle-x mb-4 z-3 pointer-events-auto">
        <div className="glass-panel px-3 py-2 rounded-5 d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-1">
            <button
              className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
              onClick={() => setTool('pen')}
              title="Pen"
            >
              <Pen size={16} />
            </button>
            <button
              className={`tool-btn ${tool === 'highlighter' ? 'active' : ''}`}
              onClick={() => setTool('highlighter')}
              title="Highlighter"
            >
              <Highlighter size={16} />
            </button>
            <button
              className={`tool-btn ${tool === 'sticky' ? 'active' : ''}`}
              onClick={() => setTool('sticky')}
              title="Add Sticky Note"
            >
              <StickyNote size={16} />
            </button>
            <button
              className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
              onClick={() => setTool('eraser')}
              title="Eraser"
            >
              <Eraser size={16} />
            </button>
          </div>

          <div className="vr opacity-25" />

          {tool !== 'eraser' && tool !== 'sticky' && (
            <div className="d-flex align-items-center gap-2">
              {presetColors.map((c) => (
                <div
                  key={c}
                  className={`color-swatch ${color === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="form-control form-control-color border-0 p-0 bg-transparent"
                style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                title="Custom Color"
              />
            </div>
          )}

          {tool !== 'eraser' && tool !== 'sticky' && <div className="vr opacity-25" />}

          <div className="d-flex align-items-center gap-2" style={{ width: '90px' }}>
            <span className="text-muted" style={{ fontSize: '11px' }}>
              Size
            </span>
            <input
              type="range"
              className="form-range"
              min="2"
              max="24"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
            />
          </div>

          <div className="vr opacity-25" />

          <div className="d-flex align-items-center gap-1">
            <button
              className="tool-btn"
              onClick={handleUndo}
              disabled={lines.length === 0}
              title="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              className="tool-btn"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo"
            >
              <Redo2 size={16} />
            </button>
            <button
              className="tool-btn text-danger"
              onClick={handleClear}
              disabled={lines.length === 0 && stickies.length === 0}
              title="Clear Canvas"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Konva Canvas Stage */}
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        ref={stageRef}
      >
        <Layer>
          {/* Drawn Lines */}
          {lines.filter((line) => line && line.points).map((line) => (
            <Line
              key={line.id}
              points={line.points}
              stroke={line.color}
              strokeWidth={line.strokeWidth}
              tension={0.4}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
            />
          ))}

          {/* Sticky Notes */}
          {stickies.map((sticky) => (
            <Group
              key={sticky.id}
              x={sticky.x}
              y={sticky.y}
              draggable
              onDragEnd={(e) => handleStickyDragEnd(e, sticky)}
              onDblClick={() => handleStickyDoubleClick(sticky)}
            >
              <Rect
                width={120}
                height={120}
                fill={sticky.color}
                cornerRadius={8}
                shadowBlur={5}
                shadowColor="rgba(0,0,0,0.2)"
              />
              <Text
                text={sticky.text.length > 50 ? sticky.text.substring(0, 50) + '...' : sticky.text}
                width={100}
                height={100}
                padding={10}
                fontSize={12}
                fill="#1e293b"
              />
              {/* Delete button (small X in corner) */}
              <Circle
                x={110}
                y={10}
                radius={8}
                fill="#ef4444"
                opacity={0.8}
                onClick={(e) => {
                  e.cancelBubble = true;
                  handleStickyDelete(sticky.id);
                }}
                onMouseEnter={(e) => e.target.opacity(1)}
                onMouseLeave={(e) => e.target.opacity(0.8)}
              />
              <Text
                x={110}
                y={10}
                text="✕"
                fontSize={10}
                fill="white"
                offsetX={3}
                offsetY={3}
                onClick={(e) => {
                  e.cancelBubble = true;
                  handleStickyDelete(sticky.id);
                }}
              />
            </Group>
          ))}

          {/* Live Cursors */}
          {Object.entries(remoteCursors).map(([id, cursor]) => (
            <Group key={id} x={cursor.x} y={cursor.y}>
              <Circle radius={6} fill="#2563eb" stroke="#ffffff" strokeWidth={2} />
              <Text
                text={cursor.username}
                x={12}
                y={-8}
                fontSize={11}
                fontStyle="bold"
                fill="#1e293b"
                padding={4}
                listening={false}
              />
            </Group>
          ))}

          {/* Floating Emoji Reactions */}
          {emojiBursts.map((burst) => (
            <Group key={burst.id} x={burst.x} y={burst.y}>
              <Text text={burst.emoji} fontSize={28} />
            </Group>
          ))}
        </Layer>
      </Stage>

      {/* Live Chat Drawer */}
      {isChatOpen && (
        <div
          className="position-fixed top-0 end-0 h-100 glass-panel border-start z-3 d-flex flex-column shadow-lg chat-drawer"
          style={{ width: `${chatWidth}px` }}
        >
          {/* Resize Handle */}
          <div
            className="chat-resize-handle"
            onMouseDown={handleChatResizeStart}
          />
          
          <div className="p-3 border-bottom d-flex justify-content-between align-items-center chat-content">
            <div className="d-flex align-items-center gap-2">
              <MessageSquare size={18} className="text-primary" />
              <h6 className="mb-0 fw-bold text-slate-800">Room Chat</h6>
            </div>
            <button
              type="button"
              className="btn-close btn-sm"
              onClick={() => setIsChatOpen(false)}
            />
          </div>

          <div className="flex-grow-1 p-3 overflow-y-auto d-flex flex-column gap-2 chat-content">
            {chatMessages.length === 0 ? (
              <div className="text-center my-auto text-muted small">
                No messages yet. Start the conversation!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-2 px-3 rounded-4 shadow-sm ${
                    msg.username === username
                      ? 'bg-primary text-white align-self-end'
                      : 'bg-white text-dark align-self-start border'
                  }`}
                  style={{ maxWidth: '85%' }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1 gap-2">
                    <strong style={{ fontSize: '11px' }}>{msg.username}</strong>
                    <span className="opacity-75" style={{ fontSize: '9px' }}>
                      {msg.time}
                    </span>
                  </div>
                  <p className="mb-0 small">{msg.text}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-3 border-top bg-transparent d-flex gap-2 chat-content">
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm rounded-3 px-3">
              Send
            </button>
          </form>
        </div>
      )}

      {/* Sticky Note Edit Overlay */}
      {editingStickyId && editingStickyPos && (
        <div
          className="position-absolute z-4"
          style={{
            left: editingStickyPos.x,
            top: editingStickyPos.y,
          }}
        >
          <div className="glass-panel p-3 rounded-3 shadow-lg" style={{ width: '200px' }}>
            <textarea
              autoFocus
              className="form-control form-control-sm mb-2"
              rows={4}
              value={editingStickyText}
              onChange={(e) => setEditingStickyText(e.target.value)}
              placeholder="Enter note text..."
            />
            <div className="d-flex gap-2 justify-content-end">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={handleStickyCancel}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleStickySave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-flex justify-content-center align-items-center z-4" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel p-4 rounded-4 shadow-lg" style={{ width: '400px', maxWidth: '90%' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 fw-bold">Invite Users</h5>
              <button className="btn-close" disabled={isSendingEmail} onClick={closeInviteModal} />
            </div>
            <p className="text-muted small mb-3">
              Share this whiteboard session with others via email or copy the invite link.
            </p>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Email (optional)</label>
              <input
                type="email"
                className="form-control rounded-3"
                placeholder="user@example.com"
                value={inviteEmail}
                disabled={isSendingEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Invite Link</label>
              <div className="input-group">
                <input
                  type="text"
                  className="form-control rounded-3"
                  value={`${window.location.origin}?room=${roomId}`}
                  readOnly
                />
                <button className="btn btn-primary rounded-3 d-flex align-items-center justify-content-center" disabled={isSendingEmail} onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}?room=${roomId}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {emailStatus && (
              <div className={`alert py-2 px-3 small rounded-3 mb-3 ${emailStatus.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                {emailStatus.message}
              </div>
            )}

            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-secondary rounded-3" disabled={isSendingEmail} onClick={closeInviteModal}>
                Cancel
              </button>
              <button className="btn btn-primary rounded-3" disabled={isSendingEmail} onClick={handleInvite}>
                {isSendingEmail ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Sending...
                  </>
                ) : inviteEmail ? (
                  'Send Email'
                ) : (
                  'Copy Link'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};