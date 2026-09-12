// src/hooks/useVoiceChat.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

export interface VoiceParticipant {
  socketId: string;
  username: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking?: boolean;
  isVideoEnabled?: boolean;
}

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 2048;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
  ],
  iceCandidatePoolSize: 5,
};

export function useVoiceChat(socket: Socket | null, _username: string, roomId: string) {
  const [isInVoice, setIsInVoice] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDeafened, setIsDeafened] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const videoSendersRef = useRef<Record<string, RTCRtpSender>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const peerAudioQueuesRef = useRef<Record<string, { nextStartTime: number }>>({});
  const peerSpeakingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const iceCandidatesQueueRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const isDeafenedRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const recentSpeakingCountRef = useRef<number>(0);

  isDeafenedRef.current = isDeafened;
  isMutedRef.current = isMuted;

  // Cleanup a specific peer connection
  const cleanupPeer = useCallback((peerSocketId: string) => {
    if (peerSpeakingTimersRef.current[peerSocketId]) {
      clearTimeout(peerSpeakingTimersRef.current[peerSocketId]);
      delete peerSpeakingTimersRef.current[peerSocketId];
    }
    delete peerAudioQueuesRef.current[peerSocketId];
    delete iceCandidatesQueueRef.current[peerSocketId];

    if (videoSendersRef.current[peerSocketId]) {
      delete videoSendersRef.current[peerSocketId];
    }

    setRemoteStreams((prev) => {
      if (!prev[peerSocketId]) return prev;
      const next = { ...prev };
      delete next[peerSocketId];
      return next;
    });

    if (peersRef.current[peerSocketId]) {
      try {
        peersRef.current[peerSocketId].close();
      } catch (e) {
        console.warn('Error closing peer connection:', e);
      }
      delete peersRef.current[peerSocketId];
    }

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

  // Teardown the voice session
  const leaveVoice = useCallback(() => {
    // Stop recording audio worklet / script processor
    if (audioWorkletNodeRef.current) {
      try {
        audioWorkletNodeRef.current.disconnect();
      } catch {}
      audioWorkletNodeRef.current = null;
    }

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    // Stop local audio and video media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.stop();
      localVideoTrackRef.current = null;
    }
    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach((track) => track.stop());
      localVideoStreamRef.current = null;
    }
    setLocalVideoStream(null);
    setIsVideoEnabled(false);
    setRemoteStreams({});
    videoSendersRef.current = {};

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Clear speaking timers
    Object.values(peerSpeakingTimersRef.current).forEach(clearTimeout);
    peerSpeakingTimersRef.current = {};
    peerAudioQueuesRef.current = {};

    // Close all peer connections
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

  // Create an RTCPeerConnection for a remote peer (WebRTC mesh)
  const createPeerConnection = useCallback(
    (peerSocketId: string, isInitiator: boolean) => {
      if (peersRef.current[peerSocketId]) {
        return peersRef.current[peerSocketId];
      }

      console.log(`[WebRTC] Initializing connection with ${peerSocketId}`);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current[peerSocketId] = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      if (localVideoTrackRef.current && localVideoStreamRef.current) {
        try {
          const sender = pc.addTrack(localVideoTrackRef.current, localVideoStreamRef.current);
          videoSendersRef.current[peerSocketId] = sender;
        } catch (e) {
          console.warn('Error adding initial video track to peer:', e);
        }
      } else {
        try {
          const vt = pc.addTransceiver('video', { direction: 'recvonly' });
          if (vt.sender) {
            videoSendersRef.current[peerSocketId] = vt.sender;
          }
        } catch (e) {
          console.warn('Error adding video transceiver to peer:', e);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && socket.connected) {
          socket.emit('voice-ice-candidate', {
            target: peerSocketId,
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        const track = event.track;
        if (track.kind === 'audio') {
          const remoteStream = event.streams[0] || new MediaStream([track]);
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
          audio.play().catch(() => {});
        } else if (track.kind === 'video') {
          console.log(`[WebRTC] Received remote video stream from ${peerSocketId}`);
          const videoStream = event.streams[0] || new MediaStream([track]);
          setRemoteStreams((prev) => ({
            ...prev,
            [peerSocketId]: videoStream,
          }));

          track.onended = () => {
            setRemoteStreams((prev) => {
              const next = { ...prev };
              delete next[peerSocketId];
              return next;
            });
          };

          track.onunmute = () => {
            console.log(`[WebRTC] Remote video track unmuted from ${peerSocketId}`);
            setRemoteStreams((prev) => ({
              ...prev,
              [peerSocketId]: event.streams[0] || new MediaStream([track]),
            }));
          };
        }
      };

      // In hybrid mode, WebRTC state changes do NOT kick users from the room
      // WebSocket audio relay keeps the voice stream alive regardless of NAT!
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Peer ${peerSocketId} state: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          console.warn(`[WebRTC] Peer ${peerSocketId} connection failed. Attempting ICE restart...`);
          try {
            pc.restartIce();
            pc.createOffer({ iceRestart: true })
              .then((offer) => pc.setLocalDescription(offer))
              .then(() => {
                if (socket && socket.connected && pc.localDescription) {
                  socket.emit('voice-signal', {
                    target: peerSocketId,
                    signal: {
                      type: pc.localDescription.type,
                      sdp: pc.localDescription.sdp,
                    },
                  });
                }
              })
              .catch((err) => console.warn('ICE restart offer failed:', err));
          } catch (e) {
            console.warn('restartIce error:', e);
          }
        }
      };

      if (isInitiator) {
        pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (socket && socket.connected && pc.localDescription) {
              socket.emit('voice-signal', {
                target: peerSocketId,
                signal: {
                  type: pc.localDescription.type,
                  sdp: pc.localDescription.sdp,
                },
              });
            }
          })
          .catch((err) => console.warn('WebRTC offer error:', err));
      }

      return pc;
    },
    [socket]
  );

  // Join the voice/video channel
  const joinVoice = useCallback(async (withVideo?: boolean | unknown) => {
    const useVideo = withVideo === true;
    if (isInVoice || isConnecting) return;

    if (!socket || !socket.connected) {
      setVoiceError('Collaboration server is not connected. Please check your connection.');
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

      // Acquire initial camera stream if joining with video
      if (useVideo) {
        try {
          const vStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 24, max: 30 },
            },
            audio: false,
          });
          const vTrack = vStream.getVideoTracks()[0];
          if (vTrack) {
            localVideoTrackRef.current = vTrack;
            localVideoStreamRef.current = vStream;
            setLocalVideoStream(vStream);
            setIsVideoEnabled(true);
          }
        } catch (vErr) {
          console.warn('Could not acquire initial camera stream:', vErr);
        }
      }

      // 2. Initialize Web Audio API AudioContext for HD Speech & Relay
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: SAMPLE_RATE });
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      // 3. Audio sample processor (shared between AudioWorklet and ScriptProcessor)
      const processAudioSamples = (input: Float32Array) => {
        if (isMutedRef.current || !socket || !socket.connected) {
          setIsSpeaking(false);
          return;
        }

        // Calculate volume
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += Math.abs(input[i]);
        }
        const avg = sum / input.length;
        const nowSpeaking = avg > 0.015;

        if (nowSpeaking) {
          recentSpeakingCountRef.current = 3; // Hangover frames to prevent clipping word endings
          setIsSpeaking(true);
        } else if (recentSpeakingCountRef.current > 0) {
          recentSpeakingCountRef.current--;
          setIsSpeaking(true);
        } else {
          setIsSpeaking(false);
        }

        // Stream audio chunk if speaking or hangover active
        if (nowSpeaking || recentSpeakingCountRef.current > 0) {
          const int16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, input[i] * 32767));
          }
          socket.emit('voice-audio-chunk', int16.buffer);
        }
      };

      const source = audioCtx.createMediaStreamSource(stream);
      let workletInitialized = false;

      // Modern AudioWorkletNode (runs on realtime audio thread, no deprecation warning)
      if (audioCtx.audioWorklet) {
        try {
          const workletCode = `
            class VoiceCaptureProcessor extends AudioWorkletProcessor {
              process(inputs) {
                const input = inputs[0];
                if (input && input[0]) {
                  this.port.postMessage(input[0]);
                }
                return true;
              }
            }
            registerProcessor('voice-capture-processor', VoiceCaptureProcessor);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await audioCtx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          const workletNode = new AudioWorkletNode(audioCtx, 'voice-capture-processor');
          audioWorkletNodeRef.current = workletNode;

          // Buffer 128-sample worklet chunks into 2048-sample packets (~128ms transmission)
          const sampleBuffer = new Float32Array(BUFFER_SIZE);
          let sampleOffset = 0;

          workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
            const chunk = event.data;
            let chunkOffset = 0;
            while (chunkOffset < chunk.length) {
              const toCopy = Math.min(chunk.length - chunkOffset, sampleBuffer.length - sampleOffset);
              sampleBuffer.set(chunk.subarray(chunkOffset, chunkOffset + toCopy), sampleOffset);
              sampleOffset += toCopy;
              chunkOffset += toCopy;

              if (sampleOffset >= sampleBuffer.length) {
                processAudioSamples(sampleBuffer);
                sampleOffset = 0;
              }
            }
          };

          source.connect(workletNode);
          workletInitialized = true;
          console.log('[Voice Engine] Modern AudioWorkletNode active (zero main-thread blocking)');
        } catch (workletErr) {
          console.warn('[Voice Engine] AudioWorklet fallback to ScriptProcessor:', workletErr);
        }
      }

      // Fallback for legacy browsers without AudioWorklet support
      if (!workletInitialized) {
        const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
        scriptProcessorRef.current = processor;
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          processAudioSamples(e.inputBuffer.getChannelData(0));
        };
      }

      // 4. Emit voice-join to Socket server
      socket.emit('voice-join');
      if (useVideo && localVideoTrackRef.current) {
        socket.emit('voice-video-state-change', { isVideoEnabled: true });
      }

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

  // Toggle camera video stream on/off
  const toggleVideo = useCallback(async () => {
    if (!isInVoice) return;

    if (!isVideoEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;

        localVideoTrackRef.current = videoTrack;
        localVideoStreamRef.current = stream;
        setLocalVideoStream(stream);
        setIsVideoEnabled(true);

        // Add or replace video track on all active peer connections
        for (const [peerId, pc] of Object.entries(peersRef.current)) {
          let sender = videoSendersRef.current[peerId];
          const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
          const videoTransceiver = transceivers.find((t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video');

          if (videoTransceiver) {
            videoTransceiver.direction = 'sendrecv';
            sender = videoTransceiver.sender;
            videoSendersRef.current[peerId] = sender;
          }

          if (sender) {
            try {
              await sender.replaceTrack(videoTrack);
            } catch (e) {
              console.warn('replaceTrack error:', e);
            }
          } else {
            try {
              const newSender = pc.addTrack(videoTrack, stream);
              videoSendersRef.current[peerId] = newSender;
            } catch (err) {
              console.warn('Error adding video track to peer:', peerId, err);
            }
          }

          if (pc.signalingState === 'stable') {
            try {
              const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
              await pc.setLocalDescription(offer);
              if (socket && socket.connected && pc.localDescription) {
                socket.emit('voice-signal', {
                  target: peerId,
                  signal: {
                    type: pc.localDescription.type,
                    sdp: pc.localDescription.sdp,
                  },
                });
              }
            } catch (err) {
              console.warn('Error renegotiating video track with peer:', peerId, err);
            }
          }
        }

        if (socket && socket.connected) {
          socket.emit('voice-video-state-change', { isVideoEnabled: true });
        }
      } catch (err: any) {
        console.warn('Camera access denied or error:', err);
        setVoiceError('Camera access denied. Please allow camera permissions in your browser.');
      }
    } else {
      // Turn video off
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current = null;
      }
      if (localVideoStreamRef.current) {
        localVideoStreamRef.current.getTracks().forEach((t) => t.stop());
        localVideoStreamRef.current = null;
      }
      setLocalVideoStream(null);
      setIsVideoEnabled(false);

      for (const [peerId, pc] of Object.entries(peersRef.current)) {
        const sender = videoSendersRef.current[peerId];
        if (sender) {
          sender.replaceTrack(null).catch(() => {});
        }
        if (pc.getTransceivers) {
          const transceivers = pc.getTransceivers();
          const vt = transceivers.find((t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video');
          if (vt) {
            vt.direction = 'recvonly';
          }
        }
      }

      if (socket && socket.connected) {
        socket.emit('voice-video-state-change', { isVideoEnabled: false });
      }
    }
  }, [isInVoice, isVideoEnabled, socket]);

  // Set up socket signaling & audio relay listeners
  useEffect(() => {
    if (!socket) return;

    // 1. Authoritative list of active voice users in this room
    const handleVoiceAllUsers = (allUsers: VoiceParticipant[]) => {
      console.log('[Voice Engine] Active room participants:', allUsers);
      // Filter out self so voiceParticipants contains remote peers
      const remotePeers = allUsers.filter((u) => u.socketId !== socket.id);
      setVoiceParticipants(remotePeers);

      // Attempt WebRTC mesh connection with peers
      const myId = socket.id || '';
      remotePeers.forEach((peer) => {
        // Deterministic tiebreaker: exactly one peer initiates to prevent glare
        const isInitiator = myId > peer.socketId;
        createPeerConnection(peer.socketId, isInitiator);
      });
    };

    // 2. Real-time Live Audio Chunk Relay from Remote Peer
    const handleVoiceAudioChunk = ({ userId, chunk }: { userId: string; chunk: ArrayBuffer }) => {
      if (isDeafenedRef.current || !audioContextRef.current) return;

      const audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const int16 = new Int16Array(chunk);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      // Mark remote peer as speaking
      setVoiceParticipants((prev) =>
        prev.map((p) => (p.socketId === userId ? { ...p, isSpeaking: true } : p))
      );

      if (peerSpeakingTimersRef.current[userId]) {
        clearTimeout(peerSpeakingTimersRef.current[userId]);
      }
      peerSpeakingTimersRef.current[userId] = setTimeout(() => {
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.socketId === userId ? { ...p, isSpeaking: false } : p))
        );
      }, 250);

      // Schedule seamless audio playback
      try {
        const audioBuffer = audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
        audioBuffer.copyToChannel(float32, 0);

        const sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(audioCtx.destination);

        if (!peerAudioQueuesRef.current[userId]) {
          peerAudioQueuesRef.current[userId] = { nextStartTime: 0 };
        }

        const queue = peerAudioQueuesRef.current[userId];
        const now = audioCtx.currentTime;
        const startTime = Math.max(now, queue.nextStartTime);
        sourceNode.start(startTime);
        queue.nextStartTime = startTime + audioBuffer.duration;
      } catch (e) {
        console.warn('Playback error:', e);
      }
    };

    // 3. WebRTC Offer / Answer signal
    const handleVoiceSignal = async ({ caller, signal }: { caller: string; signal: RTCSessionDescriptionInit }) => {
      let pc = peersRef.current[caller];

      if (signal.type === 'offer') {
        if (!pc) {
          pc = createPeerConnection(caller, false);
        }
        try {
          const isPolite = (socket.id || '') > caller;
          const offerCollision = pc.signalingState !== 'stable';

          if (offerCollision) {
            if (!isPolite) {
              console.warn('[WebRTC] Impolite peer: ignoring colliding offer from:', caller);
              return;
            }
            console.log('[WebRTC] Polite peer: rolling back local offer to accept remote offer');
            await pc.setRemoteDescription({ type: 'rollback' } as any);
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await processQueuedCandidates(caller, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (socket && socket.connected && pc.localDescription) {
            socket.emit('voice-signal', {
              target: caller,
              signal: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp,
              },
            });
          }
        } catch (err) {
          console.warn('Error handling WebRTC offer:', err);
        }
      } else if (signal.type === 'answer') {
        if (pc) {
          // Prevent InvalidStateError when answer arrives in stable state
          if (pc.signalingState !== 'have-local-offer') {
            console.warn(`[WebRTC] Ignoring answer received in state: ${pc.signalingState}`);
            return;
          }
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            await processQueuedCandidates(caller, pc);
          } catch (err) {
            console.warn('Error handling WebRTC answer:', err);
          }
        }
      }
    };

    // 4. ICE candidate received
    const handleVoiceIceCandidate = async ({ caller, candidate }: { caller: string; candidate: RTCIceCandidateInit }) => {
      if (!candidate || (!candidate.candidate && candidate.candidate !== '')) return;
      const pc = peersRef.current[caller];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Error adding ICE candidate:', err);
        }
      } else {
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
      cleanupPeer(peerSocketId);
    };

    // 7. Remote user video state changed
    const handleVoiceUserVideoChanged = ({ socketId, isVideoEnabled }: { socketId: string; isVideoEnabled: boolean }) => {
      console.log(`[Voice Engine] Remote peer ${socketId} camera toggled: ${isVideoEnabled}`);
      setVoiceParticipants((prev) =>
        prev.map((p) => (p.socketId === socketId ? { ...p, isVideoEnabled } : p))
      );
      if (!isVideoEnabled) {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[socketId];
          return next;
        });
      }
    };

    socket.on('voice-all-users', handleVoiceAllUsers);
    socket.on('voice-audio-chunk', handleVoiceAudioChunk);
    socket.on('voice-signal', handleVoiceSignal);
    socket.on('voice-ice-candidate', handleVoiceIceCandidate);
    socket.on('voice-user-state-changed', handleVoiceUserStateChanged);
    socket.on('voice-user-video-changed', handleVoiceUserVideoChanged);
    socket.on('voice-user-left', handleVoiceUserLeft);

    return () => {
      socket.off('voice-all-users', handleVoiceAllUsers);
      socket.off('voice-audio-chunk', handleVoiceAudioChunk);
      socket.off('voice-signal', handleVoiceSignal);
      socket.off('voice-ice-candidate', handleVoiceIceCandidate);
      socket.off('voice-user-state-changed', handleVoiceUserStateChanged);
      socket.off('voice-user-video-changed', handleVoiceUserVideoChanged);
      socket.off('voice-user-left', handleVoiceUserLeft);
    };
  }, [socket, createPeerConnection, cleanupPeer, processQueuedCandidates]);

  // Leave voice safely when active roomId changes
  const leaveVoiceRef = useRef(leaveVoice);
  leaveVoiceRef.current = leaveVoice;

  useEffect(() => {
    return () => {
      leaveVoiceRef.current();
    };
  }, [roomId]);

  return {
    isInVoice,
    isConnecting,
    isMuted,
    isDeafened,
    isSpeaking,
    isVideoEnabled,
    localVideoStream,
    remoteStreams,
    voiceParticipants,
    voiceError,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    clearVoiceError: () => setVoiceError(null),
  };
}
