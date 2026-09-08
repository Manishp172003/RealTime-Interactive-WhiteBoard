// src/components/Whiteboard.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Group, Circle, Text, Rect, Arrow } from 'react-konva';
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
  StickyNote as StickyNoteIcon, 
  Undo2, 
  Redo2, 
  Trash2,
  X,
  Square,
  Circle as CircleIcon,
  ArrowUpRight,
  Hand,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Zap,
  LayoutTemplate,
  Columns3,
  Grid2x2,
  Repeat,
  Lightbulb,
  GripVertical,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Type,
  HelpCircle,
  Keyboard
} from 'lucide-react';
import { WHITEBOARD_TEMPLATES, type LineData, type StickyNote } from '../utils/templates';

export interface CanvasText {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export interface LaserLine {
  id: string;
  points: number[];
  color: string;
  opacity: number;
  createdAt: number;
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

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:5000';

export const Whiteboard: React.FC<WhiteboardProps> = ({ username, initialRoomId }) => {
  const [lines, setLines] = useState<LineData[]>([]);
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const [canvasTexts, setCanvasTexts] = useState<CanvasText[]>([]);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'sticky' | 'text' | 'rect' | 'circle' | 'arrow' | 'hand' | 'laser'>('pen');
  const [laserLines, setLaserLines] = useState<LaserLine[]>([]);
  const [stageScale, setStageScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
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
  const [isTemplatesOpen, setIsTemplatesOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
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

  // Standalone Text Editing State
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState<string>('');
  const [editingTextPos, setEditingTextPos] = useState<{ x: number; y: number } | null>(null);

  // Eraser Ring Cursor State
  const [eraserHoverPos, setEraserHoverPos] = useState<{ x: number; y: number } | null>(null);

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
  const templatesDropdownRef = useRef<HTMLDivElement>(null);
  
  // Toolbar Position, Orientation, Drag & Collapse State
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [toolbarOrientation, setToolbarOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [isDraggingToolbar, setIsDraggingToolbar] = useState<boolean>(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState<boolean>(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleToolbarDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!toolbarRef.current) return;
    const rect = toolbarRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsDraggingToolbar(true);
  };

  useEffect(() => {
    if (!isDraggingToolbar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const width = toolbarRef.current?.offsetWidth || 200;
      const height = toolbarRef.current?.offsetHeight || 50;

      const newX = Math.max(10, Math.min(e.clientX - dragOffsetRef.current.x, window.innerWidth - width - 10));
      const newY = Math.max(70, Math.min(e.clientY - dragOffsetRef.current.y, window.innerHeight - height - 10));

      // Auto-snap orientation based on position: near left/right screen edges => vertical drawer dock
      if (newX < 140 || newX > window.innerWidth - width - 140) {
        setToolbarOrientation('vertical');
      } else if (newY > window.innerHeight - height - 140 || (newY < 140 && newX > 200 && newX < window.innerWidth - 300)) {
        setToolbarOrientation('horizontal');
      }

      setToolbarPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDraggingToolbar(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingToolbar]);

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

    socket.on('init-canvas', (data: { lines: LineData[]; stickies: StickyNote[]; texts?: CanvasText[] }) => {
      setLines(data.lines || []);
      setStickies(data.stickies || []);
      setCanvasTexts(data.texts || []);
    });

    socket.on('draw-line', (newLine: LineData) => {
      setLines((prev) => [...prev, newLine]);
    });

    socket.on('draw-laser', (newLaser: LaserLine) => {
      setLaserLines((prev) => {
        const index = prev.findIndex((l) => l.id === newLaser.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = newLaser;
          return updated;
        }
        return [...prev, newLaser];
      });
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

    // Canvas Text socket sync
    socket.on('add-text', (newText: CanvasText) => {
      setCanvasTexts((prev) => [...prev, newText]);
    });

    socket.on('update-text', (updatedText: CanvasText) => {
      setCanvasTexts((prev) => prev.map((t) => (t.id === updatedText.id ? updatedText : t)));
    });

    socket.on('delete-text', (textId: string) => {
      setCanvasTexts((prev) => prev.filter((t) => t.id !== textId));
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
      setCanvasTexts([]);
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

  // Decay laser pointer lines opacity over 1.5 seconds
  useEffect(() => {
    let animationFrameId: number;
    const decay = () => {
      setLaserLines((prev) => {
        if (prev.length === 0) return prev;
        const now = Date.now();
        return prev
          .map((line) => {
            const age = now - line.createdAt;
            const opacity = Math.max(0, 1 - age / 1500);
            return { ...line, opacity };
          })
          .filter((line) => line.opacity > 0);
      });
      animationFrameId = requestAnimationFrame(decay);
    };
    animationFrameId = requestAnimationFrame(decay);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

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
      if (templatesDropdownRef.current && !templatesDropdownRef.current.contains(event.target as Node)) {
        setIsTemplatesOpen(false);
      }
    };

    if (isExportDropdownOpen || isProfileDropdownOpen || isTemplatesOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExportDropdownOpen, isProfileDropdownOpen, isTemplatesOpen]);

  const handleApplyTemplate = (templateId: string) => {
    const template = WHITEBOARD_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const { lines: newLines, stickies: newStickies } = template.generate();
    setLines(newLines);
    setStickies(newStickies);
    setRedoStack([]);
    setIsTemplatesOpen(false);
    if (socketRef.current) {
      socketRef.current.emit('load-template', { lines: newLines, stickies: newStickies });
    }
  };

  // Comprehensive Keyboard Shortcuts (Tools, Undo/Redo, Panning, Cheat-Sheet)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when typing in inputs or textareas
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        setIsSpacePressed(true);
        e.preventDefault();
        return;
      }

      // Tool Switching Hotkeys
      const key = e.key.toLowerCase();
      if (key === 'p') setTool('pen');
      else if (key === 't') setTool('text');
      else if (key === 'h') setTool('hand');
      else if (key === 'e') setTool('eraser');
      else if (key === 's') setTool('sticky');
      else if (key === 'r') setTool('rect');
      else if (key === 'c') setTool('circle');
      else if (key === 'a') setTool('arrow');
      else if (key === 'l') setTool('laser');
      else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setIsShortcutsModalOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsShortcutsModalOpen(false);
        setEditingStickyId(null);
        setEditingTextId(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [lines, redoStack]);

  const handleMouseDown = (e: any) => {
    if (tool === 'hand' || isSpacePressed) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const transform = stage.getAbsoluteTransform().copy().invert();
    const relativePos = transform.point(pos);

    if (tool === 'sticky') {
      const newSticky: StickyNote = {
        id: `sticky-${Date.now()}`,
        x: relativePos.x - 60,
        y: relativePos.y - 60,
        text: 'Double click to edit',
        color: '#fef08a',
      };
      setStickies((prev) => [...prev, newSticky]);
      if (socketRef.current) socketRef.current.emit('add-sticky', newSticky);
      setTool('pen');
      return;
    }

    if (tool === 'text') {
      const newText: CanvasText = {
        id: `text-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        text: 'Type text here...',
        x: relativePos.x,
        y: relativePos.y,
        fontSize: Math.max(16, strokeWidth * 4),
        color: color,
      };
      setCanvasTexts((prev) => [...prev, newText]);
      if (socketRef.current) socketRef.current.emit('add-text', newText);
      setEditingTextId(newText.id);
      setEditingTextValue(newText.text);
      setEditingTextPos({ x: relativePos.x, y: relativePos.y });
      setTool('pen');
      return;
    }

    if (tool === 'laser') {
      isDrawing.current = true;
      const newLaser: LaserLine = {
        id: `laser-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        points: [relativePos.x, relativePos.y],
        color: '#ef4444',
        opacity: 1,
        createdAt: Date.now(),
      };
      setLaserLines((prev) => [...prev, newLaser]);
      if (socketRef.current) socketRef.current.emit('draw-laser', newLaser);
      return;
    }

    isDrawing.current = true;
    const strokeColor = tool === 'eraser' ? '#000000' : tool === 'highlighter' ? `${color}80` : color;
    const width = tool === 'eraser' ? Math.max(24, strokeWidth * 5) : tool === 'highlighter' ? strokeWidth * 3 : strokeWidth;

    const newLine: LineData = {
      id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      tool,
      color: strokeColor,
      strokeWidth: width,
      points: tool === 'rect' || tool === 'circle' || tool === 'arrow'
        ? [relativePos.x, relativePos.y, relativePos.x, relativePos.y]
        : [relativePos.x, relativePos.y],
    };

    setLines((prev) => [...prev, newLine]);
    setRedoStack([]);
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    if (!point) return;

    const transform = stage.getAbsoluteTransform().copy().invert();
    const relativePoint = transform.point(point);

    currentCursorPos.current = { x: relativePoint.x, y: relativePoint.y };

    if (tool === 'eraser') {
      setEraserHoverPos({ x: relativePoint.x, y: relativePoint.y });
    } else if (eraserHoverPos) {
      setEraserHoverPos(null);
    }

    const now = Date.now();
    if (now - lastCursorEmit.current > 30 && socketRef.current) {
      socketRef.current.emit('cursor-move', { x: relativePoint.x, y: relativePoint.y });
      lastCursorEmit.current = now;
    }

    if (!isDrawing.current) return;

    if (tool === 'laser') {
      setLaserLines((prev) => {
        if (prev.length === 0) return prev;
        const lastLaser = { ...prev[prev.length - 1] };
        lastLaser.points = lastLaser.points.concat([relativePoint.x, relativePoint.y]);
        lastLaser.createdAt = Date.now();
        if (socketRef.current) socketRef.current.emit('draw-laser', lastLaser);
        return [...prev.slice(0, -1), lastLaser];
      });
      return;
    }

    setLines((prevLines) => {
      if (prevLines.length === 0) return prevLines;
      const lastLine = { ...prevLines[prevLines.length - 1] };
      if (lastLine.tool === 'rect' || lastLine.tool === 'circle' || lastLine.tool === 'arrow') {
        lastLine.points = [lastLine.points[0], lastLine.points[1], relativePoint.x, relativePoint.y];
      } else {
        lastLine.points = lastLine.points.concat([relativePoint.x, relativePoint.y]);
      }
      return [...prevLines.slice(0, -1), lastLine];
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === 'laser') return;

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

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const zoomFactor = 1.1;
    let newScale = e.evt.deltaY < 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
    newScale = Math.max(0.1, Math.min(newScale, 10));

    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleZoomIn = () => {
    setStageScale((prev) => Math.min(prev * 1.2, 10));
  };

  const handleZoomOut = () => {
    setStageScale((prev) => Math.max(prev / 1.2, 0.1));
  };

  const handleZoomReset = () => {
    setStageScale(1);
    setStagePos({ x: 0, y: 0 });
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

  // Standalone Canvas Text Handlers
  const handleTextDoubleClick = (txt: CanvasText) => {
    setEditingTextId(txt.id);
    setEditingTextValue(txt.text);
    setEditingTextPos({ x: txt.x, y: txt.y });
  };

  const handleTextSave = () => {
    if (!editingTextId) return;
    const updated = canvasTexts.find((t) => t.id === editingTextId);
    if (!updated) return;

    if (!editingTextValue.trim()) {
      setCanvasTexts((prev) => prev.filter((t) => t.id !== editingTextId));
      if (socketRef.current) socketRef.current.emit('delete-text', editingTextId);
    } else {
      const newText = { ...updated, text: editingTextValue.trim() };
      setCanvasTexts((prev) => prev.map((t) => (t.id === editingTextId ? newText : t)));
      if (socketRef.current) socketRef.current.emit('update-text', newText);
    }

    setEditingTextId(null);
    setEditingTextValue('');
    setEditingTextPos(null);
  };

  const handleTextDragEnd = (e: any, txt: CanvasText) => {
    const newX = e.target.x();
    const newY = e.target.y();
    const updated = { ...txt, x: newX, y: newY };
    setCanvasTexts((prev) => prev.map((t) => (t.id === txt.id ? updated : t)));
    if (socketRef.current) {
      socketRef.current.emit('update-text', updated);
    }
  };

  const handleTextDelete = (textId: string) => {
    setCanvasTexts((prev) => prev.filter((t) => t.id !== textId));
    if (socketRef.current) {
      socketRef.current.emit('delete-text', textId);
    }
    setEditingTextId(null);
    setEditingTextValue('');
    setEditingTextPos(null);
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
          {/* Templates Dropdown */}
          <div className="position-relative" ref={templatesDropdownRef}>
            <button
              className="glass-panel btn p-2 px-3 rounded-4 d-flex align-items-center gap-2"
              onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
              title="Board Templates"
            >
              <LayoutTemplate size={16} className="text-primary" />
              <span className="fw-semibold text-slate-700 small d-none d-md-inline">Templates</span>
              <span className="small text-secondary" style={{ fontSize: '10px' }}>▼</span>
            </button>
            {isTemplatesOpen && (
              <div className="position-absolute top-100 end-0 mt-2 glass-panel shadow-lg border rounded-3 overflow-hidden p-2" style={{ minWidth: '280px', zIndex: 1000 }}>
                <div className="px-2 py-1 mb-1 border-bottom">
                  <small className="text-muted fw-bold" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                    Choose a Template
                  </small>
                </div>
                {WHITEBOARD_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    className="w-100 export-dropdown-item text-start p-2 border-0 rounded-2 d-flex align-items-start gap-2 mb-1"
                    onClick={() => handleApplyTemplate(tmpl.id)}
                  >
                    <div className="p-1 rounded-2 bg-primary bg-opacity-10 text-primary mt-1">
                      {tmpl.id === 'kanban' && <Columns3 size={16} />}
                      {tmpl.id === 'swot' && <Grid2x2 size={16} />}
                      {tmpl.id === 'retrospective' && <Repeat size={16} />}
                      {tmpl.id === 'brainstorming' && <Lightbulb size={16} />}
                    </div>
                    <div>
                      <div className="fw-semibold small text-slate-800">{tmpl.name}</div>
                      <small className="text-muted d-block" style={{ fontSize: '11px', lineHeight: '1.2' }}>
                        {tmpl.description}
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

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

          {/* Shortcuts Cheat-Sheet Button */}
          <button
            className="glass-panel btn p-2 rounded-4 d-flex align-items-center justify-content-center text-secondary"
            onClick={() => setIsShortcutsModalOpen(true)}
            title="Keyboard Shortcuts (?)"
            style={{ width: '38px', height: '38px' }}
          >
            <HelpCircle size={18} />
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

      {/* Floating Draggable & Collapsible Toolbar Dock */}
      <div
        ref={toolbarRef}
        className={`position-absolute z-3 pointer-events-auto ${
          toolbarPos ? '' : 'bottom-0 start-50 translate-middle-x mb-4'
        }`}
        style={
          toolbarPos
            ? {
                left: `${toolbarPos.x}px`,
                top: `${toolbarPos.y}px`,
                userSelect: 'none',
              }
            : { userSelect: 'none' }
        }
      >
        {toolbarOrientation === 'vertical' ? (
          /* ================= VERTICAL SIDEBAR / DRAWER DOCK ================= */
          <div
            className={`glass-panel px-2 py-2 rounded-4 d-flex flex-column align-items-center gap-2 shadow-lg ${
              isToolbarCollapsed ? 'py-2' : ''
            }`}
            style={{ width: isToolbarCollapsed ? 'auto' : '108px' }}
          >
            {/* Top Control Bar: Drag Grip + Orientation Switch */}
            <div className="d-flex align-items-center justify-content-between w-100 px-1">
              <div
                className="d-flex align-items-center justify-content-center text-muted px-1 py-1 rounded-2"
                style={{ cursor: isDraggingToolbar ? 'grabbing' : 'grab', opacity: 0.6 }}
                onMouseDown={handleToolbarDragStart}
                title="Drag toolbar anywhere"
              >
                <GripVertical size={16} />
              </div>
              <button
                className="tool-btn text-muted p-1"
                onClick={() => setToolbarOrientation('horizontal')}
                title="Switch to Horizontal layout"
                style={{ width: '24px', height: '24px' }}
              >
                <ArrowLeftRight size={13} />
              </button>
            </div>

            {/* Minimized / Collapsed Compact Mode */}
            {isToolbarCollapsed ? (
              <div className="d-flex flex-column align-items-center gap-2">
                <div className="tool-btn active">
                  {tool === 'pen' && <Pen size={16} />}
                  {tool === 'highlighter' && <Highlighter size={16} />}
                  {tool === 'text' && <Type size={16} />}
                  {tool === 'sticky' && <StickyNoteIcon size={16} />}
                  {tool === 'eraser' && <Eraser size={16} />}
                  {tool === 'rect' && <Square size={16} />}
                  {tool === 'circle' && <CircleIcon size={16} />}
                  {tool === 'arrow' && <ArrowUpRight size={16} />}
                  {tool === 'hand' && <Hand size={16} />}
                  {tool === 'laser' && <Zap size={16} />}
                </div>
                <button
                  className="tool-btn text-primary p-1"
                  onClick={() => setIsToolbarCollapsed(false)}
                  title="Expand Toolbar"
                  style={{ width: '28px', height: '28px' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <>
                {/* Drawing & Shape Tools Grid (2 columns) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '4px',
                    width: '100%',
                  }}
                >
                  <button
                    className={`tool-btn w-100 ${tool === 'pen' ? 'active' : ''}`}
                    onClick={() => setTool('pen')}
                    title="Pen (P)"
                  >
                    <Pen size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'highlighter' ? 'active' : ''}`}
                    onClick={() => setTool('highlighter')}
                    title="Highlighter"
                  >
                    <Highlighter size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'text' ? 'active' : ''}`}
                    onClick={() => setTool('text')}
                    title="Text Tool (T)"
                  >
                    <Type size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'sticky' ? 'active' : ''}`}
                    onClick={() => setTool('sticky')}
                    title="Sticky Note (S)"
                  >
                    <StickyNoteIcon size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'eraser' ? 'active' : ''}`}
                    onClick={() => setTool('eraser')}
                    title="Eraser (E)"
                  >
                    <Eraser size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'rect' ? 'active' : ''}`}
                    onClick={() => setTool('rect')}
                    title="Rectangle (R)"
                  >
                    <Square size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'circle' ? 'active' : ''}`}
                    onClick={() => setTool('circle')}
                    title="Circle (C)"
                  >
                    <CircleIcon size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'arrow' ? 'active' : ''}`}
                    onClick={() => setTool('arrow')}
                    title="Arrow (A)"
                  >
                    <ArrowUpRight size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'hand' ? 'active' : ''}`}
                    onClick={() => setTool('hand')}
                    title="Pan Canvas (H / Spacebar)"
                  >
                    <Hand size={15} />
                  </button>
                  <button
                    className={`tool-btn w-100 ${tool === 'laser' ? 'active' : ''}`}
                    onClick={() => setTool('laser')}
                    title="Laser Pointer (L)"
                  >
                    <Zap size={15} />
                  </button>
                </div>

                <div className="w-100 border-top opacity-25 my-1" />

                {/* Color Swatches Grid (3 columns) */}
                {tool !== 'eraser' && tool !== 'hand' && tool !== 'laser' && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '4px',
                        width: '100%',
                        justifyItems: 'center',
                      }}
                    >
                      {presetColors.map((c) => (
                        <div
                          key={c}
                          className={`color-swatch ${color === c ? 'active' : ''}`}
                          style={{ backgroundColor: c, width: '20px', height: '20px' }}
                          onClick={() => setColor(c)}
                        />
                      ))}
                    </div>
                    <div className="d-flex justify-content-center w-100 mt-1">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="form-control form-control-color border-0 p-0 bg-transparent"
                        style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                        title="Custom Color"
                      />
                    </div>
                    <div className="w-100 border-top opacity-25 my-1" />
                  </>
                )}

                {/* Stroke Size Slider */}
                {tool !== 'hand' && tool !== 'laser' && (
                  <>
                    <div className="d-flex flex-column align-items-center w-100 px-1">
                      <div
                        className="d-flex justify-content-between w-100 text-muted mb-1"
                        style={{ fontSize: '10px' }}
                      >
                        <span>Size</span>
                        <span>{strokeWidth}px</span>
                      </div>
                      <input
                        type="range"
                        className="form-range w-100"
                        min="2"
                        max="24"
                        value={strokeWidth}
                        onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      />
                    </div>
                    <div className="w-100 border-top opacity-25 my-1" />
                  </>
                )}

                {/* Undo / Redo / Clear Actions */}
                <div className="d-flex align-items-center justify-content-center gap-1 w-100">
                  <button
                    className="tool-btn"
                    onClick={handleUndo}
                    disabled={lines.length === 0}
                    title="Undo"
                  >
                    <Undo2 size={15} />
                  </button>
                  <button
                    className="tool-btn"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    title="Redo"
                  >
                    <Redo2 size={15} />
                  </button>
                  <button
                    className="tool-btn text-danger"
                    onClick={handleClear}
                    disabled={lines.length === 0 && stickies.length === 0 && canvasTexts.length === 0}
                    title="Clear Canvas"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Minimize Toggle */}
                <div className="w-100 border-top opacity-25 my-1" />
                <button
                  className="tool-btn text-muted w-100"
                  onClick={() => setIsToolbarCollapsed(true)}
                  title="Minimize Toolbar"
                >
                  <ChevronLeft size={16} />
                </button>
              </>
            )}
          </div>
        ) : (
          /* ================= HORIZONTAL BOTTOM DOCK ================= */
          <div className="glass-panel px-3 py-2 rounded-5 d-flex align-items-center gap-2 shadow-lg">
            {/* Drag Grip Handle */}
            <div
              className="d-flex align-items-center justify-content-center text-muted px-1 py-1 rounded-2"
              style={{ cursor: isDraggingToolbar ? 'grabbing' : 'grab', opacity: 0.6 }}
              onMouseDown={handleToolbarDragStart}
              title="Drag to move toolbar anywhere"
            >
              <GripVertical size={16} />
            </div>

            {/* Layout Orientation Toggle */}
            <button
              className="tool-btn text-muted"
              onClick={() => setToolbarOrientation('vertical')}
              title="Switch to Vertical layout"
            >
              <ArrowLeftRight size={14} />
            </button>

            <div className="vr opacity-25" />

            {/* Minimized / Collapsed Compact Pill Mode */}
            {isToolbarCollapsed ? (
              <div className="d-flex align-items-center gap-2">
                <div className="tool-btn active">
                  {tool === 'pen' && <Pen size={16} />}
                  {tool === 'highlighter' && <Highlighter size={16} />}
                  {tool === 'text' && <Type size={16} />}
                  {tool === 'sticky' && <StickyNoteIcon size={16} />}
                  {tool === 'eraser' && <Eraser size={16} />}
                  {tool === 'rect' && <Square size={16} />}
                  {tool === 'circle' && <CircleIcon size={16} />}
                  {tool === 'arrow' && <ArrowUpRight size={16} />}
                  {tool === 'hand' && <Hand size={16} />}
                  {tool === 'laser' && <Zap size={16} />}
                </div>
                <button
                  className="tool-btn text-primary"
                  onClick={() => setIsToolbarCollapsed(false)}
                  title="Expand Toolbar"
                >
                  <ChevronUp size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="d-flex align-items-center gap-1">
                  <button
                    className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
                    onClick={() => setTool('pen')}
                    title="Pen (P)"
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
                    className={`tool-btn ${tool === 'text' ? 'active' : ''}`}
                    onClick={() => setTool('text')}
                    title="Text Tool (T)"
                  >
                    <Type size={16} />
                  </button>
                  <button
                    className={`tool-btn ${tool === 'sticky' ? 'active' : ''}`}
                    onClick={() => setTool('sticky')}
                    title="Add Sticky Note (S)"
                  >
                    <StickyNoteIcon size={16} />
                  </button>
                  <button
                    className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
                    onClick={() => setTool('eraser')}
                    title="Eraser (E)"
                  >
                    <Eraser size={16} />
                  </button>
                  <button
                    className={`tool-btn ${tool === 'rect' ? 'active' : ''}`}
                    onClick={() => setTool('rect')}
                    title="Rectangle (R)"
                  >
                    <Square size={16} />
                  </button>
                  <button
                    className={`tool-btn ${tool === 'circle' ? 'active' : ''}`}
                    onClick={() => setTool('circle')}
                    title="Circle (C)"
                  >
                    <CircleIcon size={16} />
                  </button>
                  <button
                    className={`tool-btn ${tool === 'arrow' ? 'active' : ''}`}
                    onClick={() => setTool('arrow')}
                    title="Arrow (A)"
                  >
                    <ArrowUpRight size={16} />
                  </button>
                  <button
                    className={`tool-btn ${tool === 'hand' ? 'active' : ''}`}
                    onClick={() => setTool('hand')}
                    title="Pan Canvas (H / Spacebar)"
                  >
                    <Hand size={16} />
                  </button>
                  <button
                    className={`tool-btn ${tool === 'laser' ? 'active' : ''}`}
                    onClick={() => setTool('laser')}
                    title="Laser Pointer (L)"
                  >
                    <Zap size={16} />
                  </button>
                </div>

                <div className="vr opacity-25" />

                {tool !== 'eraser' && tool !== 'hand' && tool !== 'laser' && (
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

                {tool !== 'eraser' && tool !== 'hand' && tool !== 'laser' && (
                  <div className="vr opacity-25" />
                )}

                {tool !== 'hand' && tool !== 'laser' && (
                  <>
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
                  </>
                )}

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
                    disabled={lines.length === 0 && stickies.length === 0 && canvasTexts.length === 0}
                    title="Clear Canvas"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Collapse/Minimize Button */}
                <div className="vr opacity-25" />
                <button
                  className="tool-btn text-muted"
                  onClick={() => setIsToolbarCollapsed(true)}
                  title="Minimize Toolbar"
                >
                  <ChevronDown size={16} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Konva Canvas Stage */}
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={tool === 'hand' || isSpacePressed}
        onWheel={handleWheel}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onMouseLeave={() => setEraserHoverPos(null)}
        ref={stageRef}
        style={{
          cursor:
            tool === 'hand' || isSpacePressed
              ? 'grab'
              : tool === 'eraser'
              ? 'none'
              : tool === 'text'
              ? 'text'
              : 'crosshair',
        }}
      >
        <Layer>
          {/* Drawn Lines & Shapes */}
          {lines.filter((line) => line && line.points).map((line) => {
            if (line.tool === 'rect') {
              const x = line.points[0];
              const y = line.points[1];
              const width = line.points[2] - x;
              const height = line.points[3] - y;
              return (
                <Rect
                  key={line.id}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth}
                />
              );
            }
            if (line.tool === 'circle') {
              const x = line.points[0];
              const y = line.points[1];
              const radius = Math.sqrt(
                Math.pow((line.points[2] ?? x) - x, 2) + Math.pow((line.points[3] ?? y) - y, 2)
              );
              return (
                <Circle
                  key={line.id}
                  x={x}
                  y={y}
                  radius={radius || 0}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth}
                />
              );
            }
            if (line.tool === 'arrow') {
              return (
                <Arrow
                  key={line.id}
                  points={line.points}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth}
                  fill={line.color}
                  pointerLength={10}
                  pointerWidth={10}
                />
              );
            }
            return (
              <Line
                key={line.id}
                points={line.points}
                stroke={line.tool === 'eraser' ? '#000000' : line.color}
                strokeWidth={line.strokeWidth}
                tension={line.tool === 'pen' || line.tool === 'highlighter' || line.tool === 'eraser' ? 0.4 : 0}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === 'eraser' ? 'destination-out' : 'source-over'
                }
              />
            );
          })}

          {/* Visual Eraser Hover Indicator Ring */}
          {tool === 'eraser' && eraserHoverPos && (
            <Circle
              x={eraserHoverPos.x}
              y={eraserHoverPos.y}
              radius={Math.max(12, (strokeWidth * 5) / 2)}
              stroke={theme === 'dark' ? '#f8fafc' : '#0f172a'}
              strokeWidth={1.5}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {/* Ephemeral Laser Pointer Lines */}
          {laserLines.filter((l) => l && l.points && l.points.length >= 2).map((laser) => (
            <Line
              key={laser.id}
              points={laser.points}
              stroke={laser.color || '#ef4444'}
              strokeWidth={5}
              opacity={laser.opacity}
              tension={0.4}
              lineCap="round"
              lineJoin="round"
              shadowColor="#ef4444"
              shadowBlur={10}
              shadowOpacity={laser.opacity * 0.9}
            />
          ))}

          {/* Standalone Canvas Texts */}
          {canvasTexts.map((txt) => {
            if (txt.id === editingTextId) return null;
            return (
              <Group
                key={txt.id}
                x={txt.x}
                y={txt.y}
                draggable={tool !== 'hand' && !isSpacePressed}
                onDragEnd={(e) => handleTextDragEnd(e, txt)}
                onDblClick={() => handleTextDoubleClick(txt)}
                onDblTap={() => handleTextDoubleClick(txt)}
              >
                <Text
                  text={txt.text}
                  fontSize={txt.fontSize}
                  fill={txt.color}
                  fontFamily="Inter, system-ui, -apple-system, sans-serif"
                  fontStyle="bold"
                  padding={4}
                  shadowColor={theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)'}
                  shadowBlur={2}
                />
              </Group>
            );
          })}

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
                      ? 'chat-bubble-self align-self-end'
                      : 'chat-bubble-other align-self-start'
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

      {/* Standalone Canvas Text Edit Overlay */}
      {editingTextId && editingTextPos && (
        <div
          className="position-absolute z-4"
          style={{
            left: `${stagePos.x + editingTextPos.x * stageScale}px`,
            top: `${stagePos.y + editingTextPos.y * stageScale}px`,
            transform: 'translate(-4px, -8px)',
          }}
        >
          <div className="glass-panel p-2 rounded-3 shadow-lg d-flex align-items-center gap-2 border bg-white">
            <input
              type="text"
              autoFocus
              className="form-control form-control-sm border-0 shadow-none px-2 py-1 fw-bold"
              style={{
                fontSize: `${Math.max(14, (canvasTexts.find((t) => t.id === editingTextId)?.fontSize || 18) * stageScale)}px`,
                color: canvasTexts.find((t) => t.id === editingTextId)?.color || '#0f172a',
                minWidth: '180px',
                background: 'transparent',
              }}
              value={editingTextValue}
              onChange={(e) => setEditingTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSave();
                if (e.key === 'Escape') {
                  setEditingTextId(null);
                  setEditingTextValue('');
                  setEditingTextPos(null);
                }
              }}
            />
            <button
              className="btn btn-sm btn-primary py-0 px-2 rounded-2"
              onClick={handleTextSave}
              style={{ fontSize: '12px', height: '26px' }}
            >
              Done
            </button>
            <button
              className="btn btn-sm btn-outline-danger py-0 px-1 rounded-2"
              onClick={() => handleTextDelete(editingTextId)}
              style={{ fontSize: '12px', height: '26px' }}
              title="Delete text label"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Cheat-Sheet Modal */}
      {isShortcutsModalOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-flex justify-content-center align-items-center z-4"
          style={{ backdropFilter: 'blur(4px)' }}
          onClick={() => setIsShortcutsModalOpen(false)}
        >
          <div
            className="glass-panel p-4 rounded-4 shadow-lg"
            style={{ width: '480px', maxWidth: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center gap-2">
                <Keyboard size={20} className="text-primary" />
                <h5 className="mb-0 fw-bold">Keyboard Shortcuts</h5>
              </div>
              <button
                type="button"
                className="btn-close btn-sm"
                onClick={() => setIsShortcutsModalOpen(false)}
              />
            </div>
            
            <p className="text-muted small mb-3">
              Boost your productivity with quick keyboard hotkeys:
            </p>

            <div className="row g-2 small">
              <div className="col-6">
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Pen Tool</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">P</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Text Label</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">T</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Sticky Note</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">S</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Eraser</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">E</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Rectangle</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">R</kbd>
                </div>
              </div>

              <div className="col-6">
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Circle</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">C</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Arrow</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">A</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Laser Pointer</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">L</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Pan Canvas</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">Space</kbd>
                </div>
                <div className="p-2 rounded-3 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center mb-2">
                  <span>Undo / Redo</span>
                  <kbd className="bg-white border text-dark px-2 py-0.5 rounded shadow-xs fw-semibold">Ctrl+Z / Y</kbd>
                </div>
              </div>
            </div>

            <div className="mt-3 text-center">
              <button
                className="btn btn-sm btn-primary px-4 rounded-3"
                onClick={() => setIsShortcutsModalOpen(false)}
              >
                Got it
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

      {/* Zoom Controller HUD (Bottom-Left) */}
      <div className="position-absolute bottom-0 start-0 m-4 z-3 pointer-events-auto">
        <div className="glass-panel px-2 py-1 rounded-4 d-flex align-items-center gap-1 shadow-sm">
          <button
            className="btn btn-sm btn-link text-decoration-none text-body border-0 p-1 rounded-circle d-flex align-items-center justify-content-center"
            style={{ width: '28px', height: '28px' }}
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          
          <button
            className="btn btn-sm btn-link text-decoration-none text-slate-800 fw-bold border-0 px-2 rounded-3 small text-center"
            style={{ fontSize: '12px', minWidth: '50px' }}
            onClick={handleZoomReset}
            title="Reset Zoom (100%)"
          >
            {Math.round(stageScale * 100)}%
          </button>
          
          <button
            className="btn btn-sm btn-link text-decoration-none text-body border-0 p-1 rounded-circle d-flex align-items-center justify-content-center"
            style={{ width: '28px', height: '28px' }}
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>

          <div className="vr opacity-25 mx-1" style={{ height: '16px' }} />

          <button
            className="btn btn-sm btn-link text-decoration-none text-body border-0 p-1 rounded-circle d-flex align-items-center justify-content-center"
            style={{ width: '28px', height: '28px' }}
            onClick={handleZoomReset}
            title="Fit to screen"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};