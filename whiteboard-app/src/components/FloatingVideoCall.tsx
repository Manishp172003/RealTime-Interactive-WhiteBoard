// src/components/FloatingVideoCall.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  PhoneOff, 
  Minus, 
  Maximize2, 
  GripHorizontal,
  Users
} from 'lucide-react';
import type { VoiceParticipant } from '../hooks/useVoiceChat';

export interface FloatingVideoCallProps {
  isInVoice: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoEnabled: boolean;
  isSpeaking: boolean;
  localVideoStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  voiceParticipants: VoiceParticipant[];
  currentUsername: string;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
}

// Generate consistent avatar gradient based on username
function getAvatarColor(name: string): string {
  const colors = [
    'linear-gradient(135deg, #6366f1, #4f46e5)', // indigo
    'linear-gradient(135deg, #06b6d4, #0891b2)', // cyan
    'linear-gradient(135deg, #ec4899, #be185d)', // pink
    'linear-gradient(135deg, #10b981, #059669)', // emerald
    'linear-gradient(135deg, #f59e0b, #d97706)', // amber
    'linear-gradient(135deg, #8b5cf6, #7c3aed)', // purple
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Video Tile sub-component: handles video playback without browser autoplay policy blocking
const VideoTile: React.FC<{
  stream: MediaStream | null;
  isVideoActive: boolean;
  username: string;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isSelf?: boolean;
}> = ({ stream, isVideoActive, username, isSpeaking, isMuted, isSelf }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      if (stream && isVideoActive) {
        // Always mute the video element so browser autoplay policies never block playback.
        // Remote speech audio is played via dedicated audio elements/engine.
        videoEl.muted = true;
        videoEl.srcObject = stream;
        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.debug('[VideoTile] play error/aborted:', err);
          });
        }
      } else {
        videoEl.srcObject = null;
      }
    }
  }, [stream, isVideoActive]);

  const initials = username
    ? username.slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div 
      className="position-relative overflow-hidden rounded-3 d-flex align-items-center justify-content-center"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '80px',
        backgroundColor: '#0f172a',
        boxShadow: isSpeaking ? '0 0 0 2px #22c55e, 0 0 12px rgba(34, 197, 94, 0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: isVideoActive && stream ? 'block' : 'none',
          transform: isSelf ? 'scaleX(-1)' : 'none', // Mirror selfie camera
        }}
      />

      {/* Fallback Avatar when camera is off */}
      {(!isVideoActive || !stream) && (
        <div className="d-flex flex-column align-items-center justify-content-center p-2 text-center w-100 h-100">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow-sm mb-1"
            style={{
              width: '44px',
              height: '44px',
              fontSize: '15px',
              background: getAvatarColor(username),
              border: isSpeaking ? '2px solid #22c55e' : '2px solid rgba(255,255,255,0.2)',
            }}
          >
            {initials}
          </div>
          <span className="small text-white-50" style={{ fontSize: '11px' }}>
            <VideoOff size={11} className="me-1 opacity-75" />
            Camera off
          </span>
        </div>
      )}

      {/* Name and audio state pill */}
      <div 
        className="position-absolute bottom-0 start-0 m-1 px-2 py-0-5 rounded-pill d-flex align-items-center gap-1"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          fontSize: '11px',
          color: '#f8fafc',
          maxWidth: 'calc(100% - 10px)',
          pointerEvents: 'none',
        }}
      >
        <span className="text-truncate" style={{ maxWidth: '110px' }}>
          {username} {isSelf ? '(You)' : ''}
        </span>
        {isMuted && (
          <MicOff size={11} className="text-danger flex-shrink-0" />
        )}
      </div>

      {/* Speaking Indicator Badge (Top Right) */}
      {isSpeaking && (
        <div 
          className="position-absolute top-0 end-0 m-1 px-1-5 py-0-5 rounded-pill d-flex align-items-center gap-1 bg-success text-white"
          style={{ fontSize: '9px', fontWeight: 600, padding: '2px 6px', pointerEvents: 'none' }}
        >
          <span className="spinner-grow spinner-grow-sm" style={{ width: '6px', height: '6px' }} />
          <span>Speaking</span>
        </div>
      )}
    </div>
  );
};

export const FloatingVideoCall: React.FC<FloatingVideoCallProps> = ({
  isInVoice,
  isMuted,
  isDeafened,
  isVideoEnabled,
  isSpeaking,
  localVideoStream,
  remoteStreams,
  voiceParticipants,
  currentUsername,
  onToggleMute,
  onToggleDeafen,
  onToggleVideo,
  onLeave,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const defaultWidth = 380;
    const defaultX = typeof window !== 'undefined' ? Math.max(20, window.innerWidth - defaultWidth - 24) : 900;
    return { x: defaultX, y: 76 };
  });

  // Resizable dimensions (width & height)
  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: 380,
    height: 280,
  }));

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeStartRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number }>({
    startX: 0,
    startY: 0,
    startWidth: 380,
    startHeight: 280,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('.resize-handle')) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('.resize-handle')) return;

    const touch = e.touches[0];
    if (!touch) return;
    setIsDragging(true);
    dragStartOffset.current = {
      x: touch.clientX - position.x,
      y: touch.clientY - position.y,
    };
  };

  // Resizing handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
  };

  const handleResizeTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;
    setIsResizing(true);
    resizeStartRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const containerWidth = size.width;
      const containerHeight = size.height;

      const newX = Math.max(10, Math.min(window.innerWidth - containerWidth - 10, e.clientX - dragStartOffset.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - containerHeight - 10, e.clientY - dragStartOffset.current.y));
      setPosition({ x: newX, y: newY });
    } else if (isResizing) {
      const deltaX = e.clientX - resizeStartRef.current.startX;
      const deltaY = e.clientY - resizeStartRef.current.startY;
      const maxW = Math.min(900, window.innerWidth - position.x - 10);
      const maxH = Math.min(750, window.innerHeight - position.y - 10);
      const newWidth = Math.max(260, Math.min(maxW, resizeStartRef.current.startWidth + deltaX));
      const newHeight = Math.max(180, Math.min(maxH, resizeStartRef.current.startHeight + deltaY));
      setSize({ width: newWidth, height: newHeight });
    }
  }, [isDragging, isResizing, size.width, size.height, position.x, position.y]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    if (isDragging) {
      const containerWidth = size.width;
      const containerHeight = size.height;

      const newX = Math.max(10, Math.min(window.innerWidth - containerWidth - 10, touch.clientX - dragStartOffset.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - containerHeight - 10, touch.clientY - dragStartOffset.current.y));
      setPosition({ x: newX, y: newY });
    } else if (isResizing) {
      const deltaX = touch.clientX - resizeStartRef.current.startX;
      const deltaY = touch.clientY - resizeStartRef.current.startY;
      const maxW = Math.min(900, window.innerWidth - position.x - 10);
      const maxH = Math.min(750, window.innerHeight - position.y - 10);
      const newWidth = Math.max(260, Math.min(maxW, resizeStartRef.current.startWidth + deltaX));
      const newHeight = Math.max(180, Math.min(maxH, resizeStartRef.current.startHeight + deltaY));
      setSize({ width: newWidth, height: newHeight });
    }
  }, [isDragging, isResizing, size.width, size.height, position.x, position.y]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, isResizing, handleMouseMove, handleTouchMove, handleMouseUp]);

  if (!isInVoice) return null;

  const totalParticipants = voiceParticipants.length + 1;

  // Grid layout calculation based on total participants
  const getGridTemplate = () => {
    if (totalParticipants === 1) return '1fr';
    if (totalParticipants === 2) return '1fr 1fr';
    return '1fr 1fr';
  };

  return (
    <div
      ref={containerRef}
      className="floating-video-call position-fixed"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 1060, // Above canvas and sticky notes
        userSelect: 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()} // Prevent canvas drawing on click
      onTouchStart={(e) => e.stopPropagation()}
    >
      {isMinimized ? (
        /* Minimized Compact Pill Mode */
        <div
          className="d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg border"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(16px)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            color: '#f8fafc',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="d-flex align-items-center gap-1-5">
            <span 
              className="rounded-circle bg-success" 
              style={{ width: '8px', height: '8px', boxShadow: '0 0 8px #22c55e' }} 
            />
            <span className="fw-semibold small" style={{ fontSize: '12px' }}>
              {isVideoEnabled ? 'Video Call' : 'Voice Call'} ({totalParticipants})
            </span>
          </div>

          <div className="vr opacity-25 my-1" style={{ height: '16px' }} />

          {/* Quick Controls */}
          <button
            className={`btn btn-sm p-1 rounded-circle border-0 ${isVideoEnabled ? 'btn-primary' : 'text-white-50 hover-bg'}`}
            onClick={onToggleVideo}
            title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
            style={{ width: '28px', height: '28px' }}
          >
            {isVideoEnabled ? <Video size={13} /> : <VideoOff size={13} />}
          </button>

          <button
            className={`btn btn-sm p-1 rounded-circle border-0 ${isMuted ? 'btn-danger' : 'text-white-50 hover-bg'}`}
            onClick={onToggleMute}
            title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
            style={{ width: '28px', height: '28px' }}
          >
            {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>

          <button
            className="btn btn-sm p-1 rounded-circle border-0 text-white-50 hover-bg"
            onClick={() => setIsMinimized(false)}
            title="Expand Video Call"
            style={{ width: '28px', height: '28px' }}
          >
            <Maximize2 size={13} />
          </button>

          <button
            className="btn btn-sm p-1 rounded-circle border-0 btn-outline-danger"
            onClick={onLeave}
            title="Leave Call"
            style={{ width: '28px', height: '28px' }}
          >
            <PhoneOff size={13} />
          </button>
        </div>
      ) : (
        /* Full Floating Resizable Card Mode */
        <div
          className="rounded-4 shadow-lg overflow-hidden border position-relative d-flex flex-column"
          style={{
            width: `${size.width}px`,
            height: `${size.height}px`,
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(20px)',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            color: '#f8fafc',
            boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.65)',
            transition: isDragging || isResizing ? 'none' : 'width 0.15s ease, height 0.15s ease',
          }}
        >
          {/* Draggable Header with Preset Size Selectors */}
          <div
            className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom flex-shrink-0"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.08)',
              cursor: isDragging ? 'grabbing' : 'grab',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <div className="d-flex align-items-center gap-2">
              <GripHorizontal size={14} className="text-white-50" />
              <div className="d-flex align-items-center gap-1-5">
                <span 
                  className="rounded-circle bg-success" 
                  style={{ width: '8px', height: '8px', boxShadow: '0 0 8px #22c55e' }} 
                />
                <span className="fw-semibold small" style={{ fontSize: '13px', letterSpacing: '-0.2px' }}>
                  Live Call
                </span>
                <span 
                  className="badge rounded-pill bg-white bg-opacity-10 text-white-50 px-2 py-0-5" 
                  style={{ fontSize: '10px' }}
                >
                  <Users size={10} className="me-1" />
                  {totalParticipants}
                </span>
              </div>
            </div>

            {/* Header Right Actions: Quick Size Presets & Minimize */}
            <div className="d-flex align-items-center gap-1-5">
              {/* Size presets: Small, Medium, Large */}
              <div 
                className="d-flex align-items-center bg-black bg-opacity-40 rounded-2 p-0-5 border border-secondary border-opacity-25"
                style={{ fontSize: '10px' }}
              >
                <button
                  className={`btn btn-xs px-1-5 py-0 rounded-1 border-0 ${
                    size.width <= 300 ? 'bg-primary text-white fw-bold' : 'text-white-50'
                  }`}
                  style={{ fontSize: '10px', height: '18px', lineHeight: '18px' }}
                  onClick={() => setSize({ width: 280, height: 210 })}
                  title="Small size (280x210)"
                >
                  S
                </button>
                <button
                  className={`btn btn-xs px-1-5 py-0 rounded-1 border-0 ${
                    size.width > 300 && size.width <= 440 ? 'bg-primary text-white fw-bold' : 'text-white-50'
                  }`}
                  style={{ fontSize: '10px', height: '18px', lineHeight: '18px' }}
                  onClick={() => setSize({ width: 380, height: 280 })}
                  title="Medium size (380x280)"
                >
                  M
                </button>
                <button
                  className={`btn btn-xs px-1-5 py-0 rounded-1 border-0 ${
                    size.width > 440 ? 'bg-primary text-white fw-bold' : 'text-white-50'
                  }`}
                  style={{ fontSize: '10px', height: '18px', lineHeight: '18px' }}
                  onClick={() => setSize({ width: 540, height: 390 })}
                  title="Large size (540x390)"
                >
                  L
                </button>
              </div>

              {/* Minimize Button */}
              <button
                className="btn btn-sm p-1 rounded-2 border-0 text-white-50 hover-bg"
                onClick={() => setIsMinimized(true)}
                title="Minimize Video Call"
                style={{ width: '26px', height: '26px' }}
              >
                <Minus size={13} />
              </button>
            </div>
          </div>

          {/* Video / Avatar Grid Area (dynamically adapts to window dimensions) */}
          <div 
            className="p-2 d-grid gap-2 flex-grow-1 overflow-hidden"
            style={{
              gridTemplateColumns: getGridTemplate(),
              gridTemplateRows: totalParticipants > 2 ? '1fr 1fr' : '1fr',
              height: '100%',
              minHeight: 0,
            }}
          >
            {/* 1. Self Video / Avatar Tile */}
            <div style={{ width: '100%', height: '100%', minHeight: 0 }}>
              <VideoTile
                stream={localVideoStream}
                isVideoActive={isVideoEnabled}
                username={currentUsername || 'You'}
                isSpeaking={isSpeaking}
                isMuted={isMuted}
                isSelf={true}
              />
            </div>

            {/* 2. Remote Peers Video / Avatar Tiles */}
            {voiceParticipants.map((peer) => (
              <div 
                key={peer.socketId}
                style={{ width: '100%', height: '100%', minHeight: 0 }}
              >
                <VideoTile
                  stream={remoteStreams[peer.socketId] || null}
                  isVideoActive={peer.isVideoEnabled === true}
                  username={peer.username}
                  isSpeaking={peer.isSpeaking}
                  isMuted={peer.isMuted}
                  isSelf={false}
                />
              </div>
            ))}
          </div>

          {/* Floating Control Toolbar Footer */}
          <div
            className="d-flex align-items-center justify-content-center gap-2 p-1-5 px-3 border-top flex-shrink-0"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
            }}
          >
            {/* Camera On / Off Button */}
            <button
              className={`btn btn-sm d-flex align-items-center justify-content-center gap-1-5 rounded-pill px-3 py-1 border-0 shadow-sm ${
                isVideoEnabled ? 'btn-primary' : 'btn-dark border border-secondary text-white-50'
              }`}
              onClick={onToggleVideo}
              title={isVideoEnabled ? 'Turn Camera Off' : 'Turn Camera On'}
              style={{ fontSize: '11px', fontWeight: 500, transition: 'all 0.2s ease' }}
            >
              {isVideoEnabled ? <Video size={13} /> : <VideoOff size={13} />}
              <span>{isVideoEnabled ? 'Cam On' : 'Cam Off'}</span>
            </button>

            {/* Mic Mute / Unmute Button */}
            <button
              className={`btn btn-sm d-flex align-items-center justify-content-center gap-1-5 rounded-pill px-3 py-1 border-0 shadow-sm ${
                isMuted ? 'btn-danger' : 'btn-success'
              }`}
              onClick={onToggleMute}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              style={{ fontSize: '11px', fontWeight: 500, transition: 'all 0.2s ease' }}
            >
              {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
              <span>{isMuted ? 'Muted' : 'Mute'}</span>
            </button>

            {/* Deafen Toggle Button */}
            <button
              className={`btn btn-sm d-flex align-items-center justify-content-center rounded-circle border-0 ${
                isDeafened ? 'btn-danger' : 'btn-dark border border-secondary text-white-50'
              }`}
              onClick={onToggleDeafen}
              title={isDeafened ? 'Undeafen' : 'Deafen (Mute incoming audio)'}
              style={{ width: '30px', height: '30px' }}
            >
              {isDeafened ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>

            {/* Leave Call Button */}
            <button
              className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center rounded-circle ms-1"
              onClick={onLeave}
              title="Leave Call"
              style={{ width: '30px', height: '30px' }}
            >
              <PhoneOff size={13} />
            </button>
          </div>

          {/* Interactive Drag-to-Resize Corner Gripper (Bottom-Right) */}
          <div
            className="resize-handle position-absolute bottom-0 end-0 d-flex align-items-center justify-content-center"
            style={{
              width: '18px',
              height: '18px',
              cursor: 'se-resize',
              zIndex: 30,
              opacity: isResizing ? 1 : 0.6,
              transition: 'opacity 0.2s ease',
              margin: '2px',
            }}
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeTouchStart}
            title="Drag corner to freely resize video call window"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="rgba(255,255,255,0.7)">
              <circle cx="8" cy="2" r="1.1" />
              <circle cx="8" cy="5" r="1.1" />
              <circle cx="5" cy="5" r="1.1" />
              <circle cx="8" cy="8" r="1.1" />
              <circle cx="5" cy="8" r="1.1" />
              <circle cx="2" cy="8" r="1.1" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingVideoCall;
