// src/hooks/useVoiceChat.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

export interface VoiceParticipant {
  socketId: string;
  username: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking?: boolean;
}

// Enterprise-grade STUN and free TURN relay servers (OpenRelay Project by Metered.ca)
// Ensures WebRTC audio packets traverse strict NATs, CGNATs, firewalls, and mobile hotspots.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Google Public STUN
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // OpenRelay Public STUN
    { urls: 'stun:openrelay.metered.ca:80' },
    // OpenRelay Public TURN (UDP) - standard ports
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // OpenRelay Public TURN (TCP) - traverses strict corporate and ISP firewalls blocking UDP
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

export function useVoiceChat(socket: Socket | null, _username: string, roomId: string) {
  const [isInVoice, setIsInVoice] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDeafened, setIsDeafened] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const iceCandidatesQueueRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const disconnectTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalysersRef = useRef<Record<string, AnalyserNode>>({});
  // Maintain persistent references to remote AudioSourceNodes so Garbage Collection doesn't cut off audio!
  const remoteSourcesRef = useRef<Record<string, MediaStreamAudioSourceNode>>({});
  const animFrameRef = useRef<number | null>(null);
  const isDeafenedRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);

  isDeafenedRef.current = isDeafened;
  isMutedRef.current = isMuted;

  // Cleanup a specific peer connection and its audio elements
  const cleanupPeer = useCallback((peerSocketId: string) => {
    // Clear any disconnect grace timer
    if (disconnectTimersRef.current[peerSocketId]) {
      clearTimeout(disconnectTimersRef.current[peerSocketId]);
      delete disconnectTimersRef.current[peerSocketId];
    }

    // Disconnect WebAudio nodes
    if (remoteSourcesRef.current[peerSocketId]) {
      try {
        remoteSourcesRef.current[peerSocketId].disconnect();
      } catch (e) {
        console.warn('Error disconnecting remote audio source:', e);
      }
      delete remoteSourcesRef.current[peerSocketId];
    }

    delete remoteAnalysersRef.current[peerSocketId];
    delete iceCandidatesQueueRef.current[peerSocketId];

    // Close and remove RTCPeerConnection
    if (peersRef.current[peerSocketId]) {
      try {
        peersRef.current[peerSocketId].close();
      } catch (e) {
        console.warn('Error closing peer connection:', e);
      }
      delete peersRef.current[peerSocketId];
    }

    // Clean up HTMLAudioElement
    if (audioElementsRef.current[peerSocketId]) {
      try {
        const audio = audioElementsRef.current[peerSocketId];
        audio.pause();
        audio.srcObject = null;
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
      } catch (e) {
        console.warn('Error cleaning up audio element:', e);
      }
      delete audioElementsRef.current[peerSocketId];
    }

    setVoiceParticipants((prev) => prev.filter((p) => p.socketId !== peerSocketId));
  }, []);

  // Teardown the entire voice session
  const leaveVoice = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Clear all disconnect timers
    Object.keys(disconnectTimersRef.current).forEach((peerId) => {
      clearTimeout(disconnectTimersRef.current[peerId]);
    });
    disconnectTimersRef.current = {};

    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Close all peer connections and remove audio elements
    Object.keys(peersRef.current).forEach((peerId) => {
      cleanupPeer(peerId);
    });

    if (socket && socket.connected) {
      socket.emit('voice-leave');
    }

    setIsInVoice(false);
    setIsConnecting(false);
    setIsSpeaking(false);
    setIsMuted(false);
    setIsDeafened(false);
    setVoiceParticipants([]);
    setVoiceError(null);
  }, [socket, cleanupPeer]);

  // Drain and apply any queued ICE candidates after remote description is set
  const processQueuedCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queue = iceCandidatesQueueRef.current[peerId];
    if (queue && queue.length > 0) {
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Error adding queued ICE candidate:', e);
        }
      }
      delete iceCandidatesQueueRef.current[peerId];
    }
  }, []);

  // Create an RTCPeerConnection for a remote peer
  const createPeerConnection = useCallback(
    (peerSocketId: string, isInitiator: boolean) => {
      if (peersRef.current[peerSocketId]) {
        return peersRef.current[peerSocketId];
      }

      console.log(`[WebRTC] Creating RTCPeerConnection for ${peerSocketId} (isInitiator: ${isInitiator})`);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current[peerSocketId] = pc;

      // Add local audio tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Send local ICE candidates to remote peer via WebSocket signaling
      pc.onicecandidate = (event) => {
        if (event.candidate && socket && socket.connected) {
          socket.emit('voice-ice-candidate', {
            target: peerSocketId,
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
          });
        }
      };

      // Handle receiving remote audio track
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received remote audio track from ${peerSocketId}`);
        const remoteStream = event.streams[0];
        if (!remoteStream) return;

        let audio = audioElementsRef.current[peerSocketId];
        if (!audio) {
          audio = document.createElement('audio');
          audio.id = `remote-audio-${peerSocketId}`;
          audio.autoplay = true;
          audio.volume = 1.0;
          audio.setAttribute('playsinline', 'true');
          audio.style.display = 'none';
          document.body.appendChild(audio);
          audioElementsRef.current[peerSocketId] = audio;
        }

        audio.muted = isDeafenedRef.current;
        audio.srcObject = remoteStream;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('[WebRTC] Autoplay blocked, attaching one-time click unlocker:', err);
            const unlockPlay = () => {
              audio.play().catch(() => {});
              document.removeEventListener('click', unlockPlay);
            };
            document.addEventListener('click', unlockPlay, { once: true });
          });
        }

        // Attach remote audio analyser for real-time speaking detection
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
          try {
            const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStream);
            const remoteAnalyser = audioContextRef.current.createAnalyser();
            remoteAnalyser.fftSize = 256;
            remoteSource.connect(remoteAnalyser);
            // Save persistent reference in ref to prevent Garbage Collection!
            remoteSourcesRef.current[peerSocketId] = remoteSource;
            remoteAnalysersRef.current[peerSocketId] = remoteAnalyser;
          } catch (e) {
            console.warn('[WebRTC] Could not attach analyser to remote stream:', e);
          }
        }
      };

      // Robust Connection State Monitoring with 10s Grace Period for Transient Disconnects
      const handleStateCheck = () => {
        const state = pc.connectionState;
        const iceState = pc.iceConnectionState;
        console.log(`[WebRTC] Peer ${peerSocketId} state: connectionState=${state}, iceState=${iceState}`);

        if (state === 'connected' || iceState === 'connected') {
          // Cleared disconnect timer if reconnected
          if (disconnectTimersRef.current[peerSocketId]) {
            clearTimeout(disconnectTimersRef.current[peerSocketId]);
            delete disconnectTimersRef.current[peerSocketId];
          }
        } else if (state === 'failed' || iceState === 'failed') {
          console.warn(`[WebRTC] Peer ${peerSocketId} connection failed.`);
          cleanupPeer(peerSocketId);
        } else if (state === 'disconnected' || iceState === 'disconnected') {
          // Give 10 seconds grace period for ICE renegotiation / NAT rebind before tearing down
          if (!disconnectTimersRef.current[peerSocketId]) {
            console.warn(`[WebRTC] Peer ${peerSocketId} disconnected, giving 10s grace period to recover...`);
            disconnectTimersRef.current[peerSocketId] = setTimeout(() => {
              console.warn(`[WebRTC] Peer ${peerSocketId} grace period expired. Cleaning up.`);
              cleanupPeer(peerSocketId);
            }, 10000);
          }
        } else if (state === 'closed' || iceState === 'closed') {
          cleanupPeer(peerSocketId);
        }
      };

      pc.onconnectionstatechange = handleStateCheck;
      pc.oniceconnectionstatechange = handleStateCheck;

      // If this client is the initiator, create and send an SDP offer
      if (isInitiator) {
        pc.createOffer({ offerToReceiveAudio: true })
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (socket && socket.connected && pc.localDescription) {
              console.log(`[WebRTC] Sending offer to ${peerSocketId}`);
              socket.emit('voice-signal', {
                target: peerSocketId,
                signal: {
                  type: pc.localDescription.type,
                  sdp: pc.localDescription.sdp,
                },
              });
            }
          })
          .catch((err) => {
            console.error('Error creating offer for peer:', peerSocketId, err);
          });
      }

      return pc;
    },
    [socket, cleanupPeer]
  );

  // Join the voice channel
  const joinVoice = useCallback(async () => {
    if (isInVoice || isConnecting) return;

    // Check socket connection before requesting microphone
    if (!socket || !socket.connected) {
      setVoiceError('Collaboration server is not connected (red dot). The backend server must be running online to connect live voice with other users.');
      return;
    }

    setIsConnecting(true);
    setVoiceError(null);

    try {
      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;

      // 2. Setup Web Audio API volume analyzer for speaking detection
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        localAnalyserRef.current = analyser;

        // Optimized volume detection loop (prevents 60 FPS React re-renders)
        const localData = new Uint8Array(analyser.frequencyBinCount);
        const remoteData = new Uint8Array(128);

        const checkVolume = () => {
          if (!localStreamRef.current) return;

          // Check local user speaking level
          if (localAnalyserRef.current && !isMutedRef.current) {
            localAnalyserRef.current.getByteFrequencyData(localData);
            let sum = 0;
            for (let i = 0; i < localData.length; i++) {
              sum += localData[i];
            }
            const avg = sum / localData.length;
            const nowSpeaking = avg > 14;
            setIsSpeaking((prev) => (prev !== nowSpeaking ? nowSpeaking : prev));
          } else {
            setIsSpeaking((prev) => (prev ? false : prev));
          }

          // Check remote peers speaking level only updating state when changes occur
          if (Object.keys(remoteAnalysersRef.current).length > 0) {
            setVoiceParticipants((prev) => {
              let hasChanged = false;
              const next = prev.map((p) => {
                const rAnalyser = remoteAnalysersRef.current[p.socketId];
                let peerSpeaking = false;
                if (rAnalyser && !p.isMuted) {
                  rAnalyser.getByteFrequencyData(remoteData);
                  let rSum = 0;
                  for (let i = 0; i < remoteData.length; i++) {
                    rSum += remoteData[i];
                  }
                  peerSpeaking = rSum / remoteData.length > 14;
                }
                if (p.isSpeaking !== peerSpeaking) {
                  hasChanged = true;
                  return { ...p, isSpeaking: peerSpeaking };
                }
                return p;
              });
              return hasChanged ? next : prev;
            });
          }

          animFrameRef.current = requestAnimationFrame(checkVolume);
        };

        animFrameRef.current = requestAnimationFrame(checkVolume);
      } catch (err) {
        console.warn('AudioContext volume analyzer setup warning:', err);
      }

      // 3. Emit voice-join to Socket server
      socket.emit('voice-join');

      setIsInVoice(true);
      setIsConnecting(false);
    } catch (err: unknown) {
      setIsConnecting(false);
      const error = err as Error;
      console.error('Failed to access microphone:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setVoiceError('Microphone permission denied. Please allow microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setVoiceError('No microphone detected on your device.');
      } else {
        setVoiceError('Could not start audio: ' + (error.message || 'Unknown error'));
      }
    }
  }, [isInVoice, isConnecting, socket]);

  // Toggle local mute
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    setIsMuted(nextMuted);

    if (socket && socket.connected) {
      socket.emit('voice-state-change', {
        isMuted: nextMuted,
        isDeafened,
      });
    }
  }, [isMuted, isDeafened, socket]);

  // Toggle deafen (mutes all incoming audio)
  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);

    // Mute or unmute all remote audio elements
    Object.values(audioElementsRef.current).forEach((audio) => {
      audio.muted = nextDeafened;
    });

    if (socket && socket.connected) {
      socket.emit('voice-state-change', {
        isMuted,
        isDeafened: nextDeafened,
      });
    }
  }, [isDeafened, isMuted, socket]);

  // Set up socket signaling listeners
  useEffect(() => {
    if (!socket) return;

    // 1. Existing users already in the voice room (sent to newcomer)
    const handleVoiceAllUsers = (existingUsers: VoiceParticipant[]) => {
      console.log('[WebRTC] Received voice-all-users:', existingUsers);
      setVoiceParticipants(existingUsers);

      // Newcomer initiates offers to all existing users
      existingUsers.forEach((user) => {
        createPeerConnection(user.socketId, true);
      });
    };

    // 2. A new user joined voice
    const handleVoiceUserJoined = (newUser: VoiceParticipant) => {
      console.log('[WebRTC] Remote user joined voice:', newUser);
      setVoiceParticipants((prev) => {
        if (prev.some((p) => p.socketId === newUser.socketId)) return prev;
        return [...prev, newUser];
      });
    };

    // 3. WebRTC Offer / Answer signal
    const handleVoiceSignal = async ({ caller, signal }: { caller: string; signal: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Received signal type=${signal.type} from ${caller}`);
      let pc = peersRef.current[caller];

      if (signal.type === 'offer') {
        if (!pc) {
          pc = createPeerConnection(caller, false);
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await processQueuedCandidates(caller, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (socket && socket.connected && pc.localDescription) {
            console.log(`[WebRTC] Sending answer to ${caller}`);
            socket.emit('voice-signal', {
              target: caller,
              signal: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp,
              },
            });
          }
        } catch (err) {
          console.error('Error handling offer from peer:', caller, err);
        }
      } else if (signal.type === 'answer') {
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            await processQueuedCandidates(caller, pc);
          } catch (err) {
            console.error('Error handling answer from peer:', caller, err);
          }
        }
      }
    };

    // 4. ICE candidate received
    const handleVoiceIceCandidate = async ({ caller, candidate }: { caller: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current[caller];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Error adding ICE candidate from peer:', caller, err);
        }
      } else {
        // Queue candidates until remote description is set
        if (!iceCandidatesQueueRef.current[caller]) {
          iceCandidatesQueueRef.current[caller] = [];
        }
        iceCandidatesQueueRef.current[caller].push(candidate);
      }
    };

    // 5. Remote user changed mute/deafen status
    const handleVoiceUserStateChanged = ({ socketId, isMuted: peerMuted, isDeafened: peerDeafened }: { socketId: string; isMuted: boolean; isDeafened: boolean }) => {
      setVoiceParticipants((prev) =>
        prev.map((p) => (p.socketId === socketId ? { ...p, isMuted: peerMuted, isDeafened: peerDeafened } : p))
      );
    };

    // 6. Remote user left voice
    const handleVoiceUserLeft = (peerSocketId: string) => {
      console.log(`[WebRTC] Remote user ${peerSocketId} left voice.`);
      cleanupPeer(peerSocketId);
    };

    socket.on('voice-all-users', handleVoiceAllUsers);
    socket.on('voice-user-joined', handleVoiceUserJoined);
    socket.on('voice-signal', handleVoiceSignal);
    socket.on('voice-ice-candidate', handleVoiceIceCandidate);
    socket.on('voice-user-state-changed', handleVoiceUserStateChanged);
    socket.on('voice-user-left', handleVoiceUserLeft);

    return () => {
      socket.off('voice-all-users', handleVoiceAllUsers);
      socket.off('voice-user-joined', handleVoiceUserJoined);
      socket.off('voice-signal', handleVoiceSignal);
      socket.off('voice-ice-candidate', handleVoiceIceCandidate);
      socket.off('voice-user-state-changed', handleVoiceUserStateChanged);
      socket.off('voice-user-left', handleVoiceUserLeft);
    };
  }, [socket, createPeerConnection, cleanupPeer, processQueuedCandidates]);

  // Automatically leave voice when room changes or unmounts
  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [roomId, leaveVoice]);

  return {
    isInVoice,
    isConnecting,
    isMuted,
    isDeafened,
    isSpeaking,
    voiceParticipants,
    voiceError,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    clearVoiceError: () => setVoiceError(null),
  };
}
