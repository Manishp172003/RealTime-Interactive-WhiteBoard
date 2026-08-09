// src/components/Whiteboard.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Group, Circle, Text } from 'react-konva';
import { io, Socket } from 'socket.io-client';

export interface LineData {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  strokeWidth: number;
  points: number[];
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

interface WhiteboardProps {
  username: string;
}

const SOCKET_SERVER_URL = 'http://localhost:5000';

export const Whiteboard: React.FC<WhiteboardProps> = ({ username }) => {
  const [lines, setLines] = useState<LineData[]>([]);
  const [redoStack, setRedoStack] = useState<LineData[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState<string>('#000000');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [roomId, setRoomId] = useState<string>('default-room');
  const [remoteCursors, setRemoteCursors] = useState<Record<string, UserCursor>>({});

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState<string>('');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 60,
  });

  const isDrawing = useRef<boolean>(false);
  const stageRef = useRef<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastCursorEmit = useRef<number>(0);

  // Initialize Socket.io Connection
  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;

    socket.emit('join-room', { roomId, username });

    // Initial canvas state from server
    socket.on('init-canvas', (initialLines: LineData[]) => {
      setLines(initialLines);
    });

    // Receive live drawn lines from other users
    socket.on('draw-line', (newLine: LineData) => {
      setLines((prev) => [...prev, newLine]);
    });

    // Receive live cursor movements
    socket.on('cursor-move', (cursorData: UserCursor) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [cursorData.userId]: {
          ...cursorData,
          color: cursorData.color || '#dc3545',
        },
      }));
    });

    // Receive live chat messages
    socket.on('receive-chat-message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    // Handle user disconnect
    socket.on('user-disconnected', (userId: string) => {
      setRemoteCursors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    socket.on('clear-canvas', () => {
      setLines([]);
      setRedoStack([]);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, username]);

  // Window Resize Listener
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 60,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Drawing Handlers
  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const newLine: LineData = {
      id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      tool,
      color: tool === 'eraser' ? '#f8f9fa' : color,
      strokeWidth,
      points: [pos.x, pos.y],
    };

    setLines((prev) => [...prev, newLine]);
    setRedoStack([]);
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    if (!point) return;

    // Emit cursor movement (Throttled to every 30ms)
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

    // Emit completed stroke to server
    if (lines.length > 0 && socketRef.current) {
      const lastLine = lines[lines.length - 1];
      socketRef.current.emit('draw-line', lastLine);
    }
  };

  const handleUndo = () => {
    if (lines.length === 0) return;
    const lastLine = lines[lines.length - 1];
    setRedoStack((prev) => [...prev, lastLine]);
    setLines((prev) => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const lineToRestore = redoStack[redoStack.length - 1];
    setLines((prev) => [...prev, lineToRestore]);
    if (socketRef.current) {
      socketRef.current.emit('draw-line', lineToRestore);
    }
    setRedoStack((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (lines.length === 0) return;
    setLines([]);
    setRedoStack([]);
    if (socketRef.current) {
      socketRef.current.emit('clear-canvas');
    }
  };

  const handleExportPNG = () => {
    if (!stageRef.current) return;
    const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !socketRef.current) return;
    socketRef.current.emit('send-chat-message', messageInput.trim());
    setMessageInput('');
  };

  return (
    <div className="position-relative w-100 h-100 overflow-hidden bg-light">
      {/* Floating Toolbar */}
      <div
        className="position-absolute top-0 start-50 translate-middle-x mt-3 z-3 bg-white p-2 rounded-3 shadow-sm border d-flex flex-wrap align-items-center gap-2"
        style={{ maxWidth: '95vw' }}
      >
        {/* Room ID Controller */}
        <div className="d-flex align-items-center gap-1">
          <small className="text-muted fw-bold">Room:</small>
          <input
            type="text"
            className="form-control form-control-sm"
            style={{ width: '110px' }}
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
        </div>

        <div className="vr mx-1" />

        {/* Tools */}
        <div className="btn-group btn-group-sm">
          <button
            className={`btn ${tool === 'pen' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setTool('pen')}
          >
            ✏️ Pen
          </button>
          <button
            className={`btn ${tool === 'eraser' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setTool('eraser')}
          >
            🧹 Eraser
          </button>
        </div>

        <div className="vr mx-1" />

        {/* Color Palette */}
        {tool === 'pen' && (
          <div className="d-flex align-items-center gap-1">
            {['#000000', '#d9534f', '#0275d8', '#5cb85c', '#f0ad4e', '#6f42c1'].map((c) => (
              <button
                key={c}
                className="btn btn-sm rounded-circle p-0"
                style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: c,
                  border: color === c ? '2px solid #000' : '1px solid #ccc',
                  transform: color === c ? 'scale(1.15)' : 'scale(1)',
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        )}

        <div className="vr mx-1" />

        {/* Size Slider */}
        <div className="d-flex align-items-center gap-2" style={{ minWidth: '100px' }}>
          <input
            type="range"
            className="form-range"
            min="1"
            max="30"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
          />
        </div>

        <div className="vr mx-1" />

        {/* Undo / Redo / Clear */}
        <div className="btn-group btn-group-sm">
          <button
            className="btn btn-outline-secondary"
            onClick={handleUndo}
            disabled={lines.length === 0}
            title="Undo"
          >
            ↩️
          </button>
          <button
            className="btn btn-outline-secondary"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo"
          >
            ↪️
          </button>
        </div>

        <button
          className="btn btn-outline-danger btn-sm"
          onClick={handleClear}
          disabled={lines.length === 0}
        >
          🗑️ Clear
        </button>

        <div className="vr mx-1" />

        {/* Export */}
        <button className="btn btn-success btn-sm" onClick={handleExportPNG}>
          💾 Export
        </button>

        <div className="vr mx-1" />

        {/* Live Chat Toggle Button */}
        <button
          className="btn btn-outline-primary btn-sm position-relative"
          onClick={() => setIsChatOpen(!isChatOpen)}
        >
          💬 Chat
        </button>
      </div>

      {/* Canvas */}
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
        className="bg-white"
      >
        <Layer>
          {/* Drawn Lines */}
          {lines.map((line) => (
            <Line
              key={line.id}
              points={line.points}
              stroke={line.color}
              strokeWidth={line.strokeWidth}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
            />
          ))}

          {/* Remote Live Cursors */}
          {Object.entries(remoteCursors).map(([id, cursor]) => (
            <Group key={id} x={cursor.x} y={cursor.y}>
              <Circle radius={5} fill="#dc3545" />
              <Text
                text={cursor.username}
                x={8}
                y={-8}
                fontSize={12}
                fill="#212529"
                padding={2}
                listening={false}
              />
            </Group>
          ))}
        </Layer>
      </Stage>

      {/* Live Chat Drawer */}
      {isChatOpen && (
        <div
          className="position-fixed top-0 end-0 h-100 bg-white shadow border-start z-3 d-flex flex-column"
          style={{ width: '300px', paddingTop: '60px' }}
        >
          <div className="p-3 bg-dark text-white d-flex justify-content-between align-items-center">
            <h6 className="mb-0">💬 Live Chat ({roomId})</h6>
            <button
              type="button"
              className="btn-close btn-close-white btn-sm"
              onClick={() => setIsChatOpen(false)}
            />
          </div>

          <div className="flex-grow-1 p-3 overflow-y-auto d-flex flex-column gap-2 bg-light">
            {chatMessages.length === 0 ? (
              <p className="text-muted small text-center my-auto">No messages yet.</p>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-2 rounded-3 shadow-sm ${
                    msg.username === username
                      ? 'bg-primary text-white align-self-end'
                      : 'bg-white text-dark align-self-start border'
                  }`}
                  style={{ maxWidth: '85%' }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong style={{ fontSize: '11px' }}>{msg.username}</strong>
                    <span className="opacity-75 ms-2" style={{ fontSize: '9px' }}>
                      {msg.time}
                    </span>
                  </div>
                  <p className="mb-0 small">{msg.text}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-2 border-top bg-white d-flex gap-2">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
};