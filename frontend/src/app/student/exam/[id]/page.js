'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { studentApi, proctorApi } from '../../../../api';
import { 
  Clock, ShieldAlert, ChevronLeft, ChevronRight, CheckCircle, 
  AlertCircle, Upload, Eye, RefreshCw, Send, Check, Camera
} from 'lucide-react';

const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined') {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    } else {
      resolve();
    }
  });
};

const dataURLtoFile = (dataurl, filename) => {
  let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, {type:mime});
};

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id;

  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [warnings, setWarnings] = useState([]);
  const [camStatus, setCamStatus] = useState('initializing');
  
  // Model & warning state variables
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState(null);
  const [suspicionScore, setSuspicionScore] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningModalMsg, setWarningModalMsg] = useState("");

  // Handwritten answer state details
  const [uploadingImage, setUploadingImage] = useState(false);
  const [localImageFile, setLocalImageFile] = useState(null);
  const [localImagePreview, setLocalImagePreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState(null);
  
  const [wordErrors, setWordErrors] = useState({});
  const [fullscreenRequired, setFullscreenRequired] = useState(true);
  const debounceTimeoutsRef = useRef({});


  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const autoSaveIntervalRef = useRef(null);
  
  const detectorRef = useRef(null);
  const proctorLoopRef = useRef(null);
  const tempViolationsRef = useRef([]);
  const wsRef = useRef(null);
  const answersRef = useRef({});
  const suspicionScoreRef = useRef(0);
  const submittedRef = useRef(false);

  // Synchronize refs for event handlers
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    suspicionScoreRef.current = suspicionScore;
  }, [suspicionScore]);

  // Load models dynamically from CDNs
  useEffect(() => {
    let active = true;
    async function loadModels() {
      try {
        setModelLoading(true);
        // Load tfjs core
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js");
        // Load face-mesh runtime dependencies
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
        // Load face landmarks detection
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection@1.0.5/dist/face-landmarks-detection.min.js");
        
        if (active) {
          console.log("Client-side TF.js & Face Landmarks models loaded.");
          initClientDetector();
        }
      } catch (err) {
        console.error("Failed to load scripts from CDN:", err);
        if (active) {
          setModelError("CDN blocked or timeout. Using mock proctoring simulator.");
          setModelLoading(false);
          startSimulatedProctor();
        }
      }
    }
    loadModels();

    return () => {
      active = false;
    };
  }, []);

  const initClientDetector = async () => {
    try {
      const model = window.faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
      const detector = await window.faceLandmarksDetection.createDetector(model, {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
      });
      detectorRef.current = detector;
      setModelLoading(false);
    } catch (err) {
      console.error("Detector construction failed:", err);
      setModelError("Failed to initialize face detector. Using mock proctoring.");
      setModelLoading(false);
      startSimulatedProctor();
    }
  };

  // Start checking loop once webcam is active and model has finished loading
  useEffect(() => {
    if (camStatus === 'active' && !modelLoading && !proctorLoopRef.current) {
      if (detectorRef.current) {
        proctorLoopRef.current = setInterval(() => {
          runClientProctorCheck();
        }, 2000);
      } else {
        startSimulatedProctor();
      }
    }
  }, [camStatus, modelLoading]);

  // WebSocket Heartbeat connector
  useEffect(() => {
    if (!sessionId) return;

    const wsUrl = `ws://localhost:8000/api/proctor/ws/${sessionId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Proctor WebSocket link open.");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.suspicion_score !== undefined) {
        setSuspicionScore(data.suspicion_score);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected.");
    };

    // Send heartbeat check every 10 seconds
    const heartbeatInterval = setInterval(() => {
      sendHeartbeat();
    }, 10000);

    return () => {
      clearInterval(heartbeatInterval);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [sessionId]);

  const submitWithKeepAlive = () => {
    if (!sessionId) return;
    const token = localStorage.getItem('token');
    const sessionToken = localStorage.getItem('session_token');
    
    // Save current answers first
    const answersData = JSON.stringify({ answers: answersRef.current });
    fetch(`http://localhost:8000/api/student/session/${sessionId}/save`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Session-Token': sessionToken,
        'Content-Type': 'application/json'
      },
      body: answersData,
      keepalive: true
    }).catch(err => console.error(err));

    // Submit the session
    fetch(`http://localhost:8000/api/student/session/${sessionId}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Session-Token': sessionToken,
        'Content-Type': 'application/json'
      },
      keepalive: true
    }).catch(err => console.error(err));
  };

  const enterFullscreen = async () => {
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
      }
      setFullscreenRequired(false);
    } catch (err) {
      console.error("Failed to enter fullscreen:", err);
      alert("Failed to enter full screen. Please ensure your browser supports fullscreen mode.");
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
        // Exited fullscreen!
        setFullscreenRequired(true);
        if (sessionId) {
          proctorApi.logEvent(sessionId, 'fullscreen_exit', 'Student exited full screen mode.');
          triggerLocalWarning('Exited full screen mode! This event has been flagged.');
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              violations: ["fullscreen_exit"],
              description: "Student exited full screen mode.",
              suspicion_score: Math.min(suspicionScoreRef.current + 15.0, 100.0)
            }));
          }
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [sessionId]);

  // 1. Initial Load & Setup
  useEffect(() => {
    startSession();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(proctorLoopRef.current);
      clearInterval(autoSaveIntervalRef.current);
      stopWebcam();
      
      // Auto-submit if student is leaving page via router / client-side navigation
      if (!submittedRef.current) {
        submittedRef.current = true;
        submitWithKeepAlive();
      }
    };
  }, []);

  // Listen to beforeunload / unload to submit session if tab/browser is closed/reloaded
  useEffect(() => {
    const handleUnload = () => {
      if (!submittedRef.current) {
        submittedRef.current = true;
        submitWithKeepAlive();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [sessionId]);

  const startSession = async () => {
    try {
      setLoading(true);
      const res = await studentApi.startExam(examId);
      const { session_id, session_token, end_time, questions: qs, answers: savedAnswers } = res.data;
      
      setSessionId(session_id);
      if (session_token) {
        localStorage.setItem('session_token', session_token);
      }
      setQuestions(qs);
      setAnswers(savedAnswers || {});
      
      // Calculate remaining time
      const remainingMs = new Date(end_time) - new Date();
      const remainingSecs = Math.max(Math.floor(remainingMs / 1000), 0);
      setTimeLeft(remainingSecs);

      // Start countdown
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleAutoSubmit(session_id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Start webcam stream
      initWebcam(session_id);

      // Setup tab change, right click, and copy/paste security logging
      setupBrowserListeners(session_id);

      // Start autosave interval (every 10 seconds)
      autoSaveIntervalRef.current = setInterval(() => {
        saveProgress(session_id, answersRef.current);
      }, 10000);

      setLoading(false);
    } catch (err) {
      alert('Failed to load exam session: ' + (err.response?.data?.detail || err.message));
      router.push('/student');
    }
  };

  // 2. Autosave Progress
  const saveProgress = async (sid, currentAns) => {
    try {
      await studentApi.saveAnswers(sid, currentAns);
    } catch (err) {
      console.error('Autosave failed:', err);
    }
  };

  // 3. Browser Focus & Tab Change Monitor + Right-Click/Copy/Paste blockers
  const setupBrowserListeners = (sid) => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        proctorApi.logEvent(sid, 'tab_switch', 'Student switched browser tab.');
        triggerLocalWarning('Tab switch detected. This event has been flagged to the examiner!');
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            violations: ["tab_switch"],
            description: "Student switched browser tab.",
            suspicion_score: Math.min(suspicionScoreRef.current + 10.0, 100.0)
          }));
        }
      }
    };

    const handleWindowBlur = () => {
      proctorApi.logEvent(sid, 'window_blur', 'Student left the exam window.');
      triggerLocalWarning('Window focus lost. Please stay on the examination screen!');

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          violations: ["window_blur"],
          description: "Student left the exam window.",
          suspicion_score: Math.min(suspicionScoreRef.current + 10.0, 100.0)
        }));
      }
    };

    const preventDefault = (e) => {
      e.preventDefault();
    };

    const handleCopyPaste = (e) => {
      e.preventDefault();
      const action = e.type; // 'copy', 'paste', 'cut'
      triggerLocalWarning(`Action '${action}' is disabled during this exam!`);
      proctorApi.logEvent(sid, 'security_violation', `Student attempted to ${action} text.`);
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          violations: ["security_violation"],
          description: `Security event: Student attempted to ${action} text.`,
          suspicion_score: Math.min(suspicionScoreRef.current + 10.0, 100.0)
        }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('contextmenu', preventDefault);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('cut', handleCopyPaste);

    // Store cleanup in window object
    window._examCleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('contextmenu', preventDefault);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('cut', handleCopyPaste);
    };
  };

  const triggerLocalWarning = (msg) => {
    setWarnings((prev) => {
      const updated = [msg, ...prev];
      return updated.slice(0, 3); // keep last 3 warnings
    });
  };

  // 4. Webcam Stream
  const initWebcam = async (sid) => {
    try {
      console.log("Attempting to access webcam with ideal constraints...");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 320 }, 
            height: { ideal: 240 } 
          } 
        });
      } catch (firstErr) {
        console.warn("Webcam access with ideal constraints failed, falling back to simple video:true...", firstErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCamStatus('active');
        console.log("Webcam stream initialized successfully.");
      }
    } catch (err) {
      console.error("Webcam initialization failed:", err);
      setCamStatus('error');
      proctorApi.logEvent(sid, 'cam_error', `Webcam error: ${err.name} - ${err.message}`);
      
      let warningMsg = 'Webcam access was denied. Exam monitoring requires camera access!';
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        warningMsg = 'No camera device found. Please connect a webcam to continue!';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        warningMsg = 'Camera is already in use by another application. Please close other apps using the camera!';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        warningMsg = 'Camera permission was denied. Please allow camera access in your browser settings!';
      }
      triggerLocalWarning(warningMsg);
    }
  };

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(t => t.stop());
    }
    if (window._examCleanup) {
      window._examCleanup();
    }
  };

  // Client-side proctoring engine face Landmarks Estimator
  const runClientProctorCheck = async () => {
    if (!videoRef.current || !detectorRef.current || camStatus !== 'active') return;

    try {
      const faces = await detectorRef.current.estimateFaces(videoRef.current);
      let detected = [];

      if (faces.length === 0) {
        detected.push("face_missing");
      } else if (faces.length > 1) {
        detected.push("multiple_faces");
      } else {
        // Gaze tracking calculation using landmarks
        const face = faces[0];
        if (face.keypoints) {
          const nose = face.keypoints.find(k => k.name === 'noseTip') || face.keypoints[4];
          const leftEye = face.keypoints.find(k => k.name === 'leftEye') || face.keypoints[33];
          const rightEye = face.keypoints.find(k => k.name === 'rightEye') || face.keypoints[263];

          if (nose && leftEye && rightEye) {
            const distLeft = Math.abs(nose.x - leftEye.x);
            const distRight = Math.abs(nose.x - rightEye.x);
            const ratio = distRight > 0 ? distLeft / distRight : 1.0;

            // Flag gaze_away if nose shifts too far to one side
            if (ratio < 0.55 || ratio > 1.8) {
              detected.push("gaze_away");
            }
          }
        }
      }

      if (detected.length > 0) {
        tempViolationsRef.current = [...new Set([...tempViolationsRef.current, ...detected])];
      }
    } catch (err) {
      console.error("AI proctoring frame estimation error:", err);
    }
  };

  const startSimulatedProctor = () => {
    proctorLoopRef.current = setInterval(() => {
      // 5% chance of visual proctor warnings for simulation fallback
      const rand = Math.random();
      let simulated = [];
      if (rand < 0.05) {
        const issues = ["gaze_away", "face_missing"];
        simulated.push(issues[Math.floor(Math.random() * issues.length)]);
      }

      if (simulated.length > 0) {
        tempViolationsRef.current = [...new Set([...tempViolationsRef.current, ...simulated])];
      }
    }, 2000);
  };

  const sendHeartbeat = () => {
    const currentViolations = tempViolationsRef.current;
    tempViolationsRef.current = []; // Reset for next window

    if (currentViolations.length > 0) {
      if (violationCount === 0) {
        // First violation: show warning modal, do not increment score
        setViolationCount(1);
        let msg = "Webcam monitoring alert. Please maintain focus on the exam.";
        if (currentViolations.includes("face_missing")) {
          msg = "Face absent detected. Ensure you are fully visible in the camera frame.";
        } else if (currentViolations.includes("multiple_faces")) {
          msg = "Multiple people detected. Only the student is allowed in the camera frame.";
        } else if (currentViolations.includes("gaze_away")) {
          msg = "Looking away detected. Keep your gaze directed at the exam screen.";
        }

        setWarningModalMsg(msg);
        setShowWarningModal(true);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            violations: currentViolations,
            description: `First warning modal shown: ${msg}`,
            suspicion_score: suspicionScore
          }));
        }
        triggerLocalWarning(`Violation warning overlay triggered: ${currentViolations.join(', ')}`);
      } else {
        // Subsequent violations: increment suspicion score
        let penalty = 0.0;
        currentViolations.forEach(v => {
          if (v === "face_missing") penalty += 15.0;
          if (v === "multiple_faces") penalty += 25.0;
          if (v === "gaze_away") penalty += 5.0;
        });

        setSuspicionScore((prev) => {
          const nextScore = Math.min(prev + penalty, 100.0);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              violations: currentViolations,
              description: `Subsequent violations detected: ${currentViolations.join(', ')}`,
              suspicion_score: nextScore
            }));
          }
          triggerLocalWarning(`Proctor event flagged: ${currentViolations.join(', ')} (Suspicion: +${penalty}%)`);
          return nextScore;
        });
      }
    } else {
      // Send regular keep-alive heartbeat
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          violations: [],
          description: "Heartbeat: normal",
          suspicion_score: suspicionScore
        }));
      }
    }
  };

  // 5. Answer Choices Handlers
  const handleAnswerSelect = async (qId, val) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: val
    }));
    try {
      await studentApi.submitSingleAnswer(sessionId, qId, val);
    } catch (err) {
      console.error("Failed to save answer immediately:", err);
    }
  };

  const handleMultiSelectToggle = async (qId, val) => {
    const currentVal = answers[qId] || [];
    const nextVal = currentVal.includes(val)
      ? currentVal.filter(item => item !== val)
      : [...currentVal, val];
      
    setAnswers((prev) => ({
      ...prev,
      [qId]: nextVal
    }));
    try {
      await studentApi.submitSingleAnswer(sessionId, qId, nextVal);
    } catch (err) {
      console.error("Failed to save multi-select answer immediately:", err);
    }
  };

  const handleTextChange = (qId, val, type) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
    
    const maxWords = type === 'short' ? 150 : 1000;
    const words = val.trim().split(/\s+/).filter(Boolean).length;
    
    if (words > maxWords) {
      setWordErrors(prev => ({ 
        ...prev, 
        [qId]: `Word count exceeds maximum limit of ${maxWords} words (${words}/${maxWords}).` 
      }));
    } else {
      setWordErrors(prev => ({ ...prev, [qId]: null }));
      
      if (debounceTimeoutsRef.current[qId]) {
        clearTimeout(debounceTimeoutsRef.current[qId]);
      }
      
      debounceTimeoutsRef.current[qId] = setTimeout(async () => {
        try {
          await studentApi.submitSingleAnswer(sessionId, qId, val);
        } catch (err) {
          console.error("Debounced text save failed:", err);
        }
      }, 1500);
    }
  };

  const toggleFlag = (qId) => {
    setFlagged((prev) => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  // Local image select/drag-and-drop preview handler
  const handleLocalImageSelect = (file) => {
    if (!file) return;
    setLocalImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setLocalImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Confirmation Upload handler
  const handleConfirmUpload = async (qId) => {
    if (!localImageFile) return;

    setUploadingImage(true);
    try {
      const res = await studentApi.uploadHandwritten(sessionId, qId, localImageFile);
      handleAnswerSelect(qId, res.data.image_url);
      setLocalImageFile(null);
      setLocalImagePreview(null);
      alert('Handwritten work uploaded successfully.');
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploadingImage(false);
    }
  };

  // General PDF / CS File Upload handler
  const handleGeneralFileUpload = async (qId, file) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const res = await studentApi.uploadFile(sessionId, qId, file);
      handleAnswerSelect(qId, res.data.file_url);
      alert('File uploaded successfully.');
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploadingImage(false);
    }
  };

  // Webcam Snap Photo capture countdown trigger
  const captureFromWebcam = () => {
    if (!videoRef.current || camStatus !== 'active') {
      alert("Exam camera feed is not ready or blocked.");
      return;
    }

    setCaptureCountdown(3);
    const interval = setInterval(() => {
      setCaptureCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          
          const file = dataURLtoFile(dataUrl, 'handwritten_work.jpg');
          setLocalImageFile(file);
          setLocalImagePreview(dataUrl);
          setCaptureCountdown(null);
          return null;
        }
        return prev - 1;
      });
    }, 800);
  };

  // 6. Submissions
  const handleAutoSubmit = async (sid) => {
    submittedRef.current = true;
    stopWebcam();
    try {
      await studentApi.saveAnswers(sid, answersRef.current);
      await studentApi.submitExam(sid);
      alert('Time limit reached! Your exam session has been auto-submitted.');
      router.push('/student');
    } catch (err) {
      router.push('/student');
    }
  };

  const handleManualSubmit = async () => {
    if (!confirm('Are you sure you want to finish and submit your exam? You cannot modify your answers after this.')) return;
    
    submittedRef.current = true;
    stopWebcam();
    try {
      setLoading(true);
      await studentApi.saveAnswers(sessionId, answers);
      await studentApi.submitExam(sessionId);
      alert('Exam submitted successfully.');
      router.push('/student');
    } catch (err) {
      submittedRef.current = false;
      alert('Failed to submit exam: ' + (err.response?.data?.detail || err.message));
      setLoading(false);
    }
  };

  // 7. Format Clock Timer
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTimerStyles = () => {
    if (timeLeft <= 60) {
      return {
        color: 'var(--accent-rose)',
        borderColor: 'rgba(244, 63, 94, 0.4)',
        background: 'rgba(244, 63, 94, 0.08)',
        animation: 'pulse 1.2s infinite'
      };
    }
    if (timeLeft <= 300) {
      return {
        color: 'var(--accent-amber)',
        borderColor: 'rgba(245, 158, 11, 0.4)',
        background: 'rgba(245, 158, 11, 0.08)'
      };
    }
    return {
      color: 'var(--accent-cyan)',
      borderColor: 'var(--border-glass)',
      background: 'rgba(255, 255, 255, 0.02)'
    };
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--accent-cyan)' }} />
        <span>Loading exam engine and starting proctor feeds...</span>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const totalQ = questions.length;

  if (fullscreenRequired) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 9, 19, 0.95)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '2rem'
      }}>
        <div className="glass-panel" style={{
          maxWidth: '550px',
          width: '100%',
          padding: '3rem',
          textAlign: 'center',
          border: '1px solid rgba(0, 242, 254, 0.3)',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(0, 242, 254, 0.05) 100%)',
          boxShadow: '0 20px 40px rgba(0, 242, 254, 0.1)'
        }}>
          <ShieldAlert size={56} style={{ color: 'var(--accent-cyan)', marginBottom: '1.5rem', margin: '0 auto' }} />
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '1rem', color: 'white' }}>
            Full Screen Mode Required
          </h2>
          <p style={{ color: 'var(--text-primary)', marginBottom: '2rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
            This exam is AI-proctored. To maintain examination integrity, you are required to remain in full screen mode for the entire duration of the test.
          </p>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '1rem', marginBottom: '2.5rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: 'var(--accent-rose)' }}>🚨 STRICT RULES:</p>
            <ul style={{ paddingLeft: '1.25rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <li>Exiting full screen will be logged as a proctoring violation.</li>
              <li>Multiple violations will increase your suspicion score and flag your exam.</li>
              <li>Please close other tabs and apps before beginning.</li>
            </ul>
          </div>
          <button
            onClick={enterFullscreen}
            className="btn-primary"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, var(--accent-cyan), #00b4d8)',
              color: '#0b0f19',
              border: 'none',
              padding: '1rem',
              fontWeight: '800',
              fontSize: '1rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Enter Full Screen & Begin Exam
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* Sidebar Navigation */}
      <div className="glass-panel" style={{
        width: '320px',
        borderRight: '1px solid var(--border-glass)',
        borderTop: 'none',
        borderBottom: 'none',
        borderRadius: '0px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div>
          {/* Header & Clock */}
          <div style={{
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border-glass)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.6rem 0.8rem',
              borderRadius: '8px',
              border: '1px solid',
              transition: 'all 0.3s ease',
              ...getTimerStyles()
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={18} />
                <span style={{ fontSize: '1.2rem', fontWeight: '800', fontFamily: 'monospace' }}>
                  {formatTime(timeLeft)}
                </span>
              </div>
              {timeLeft <= 60 ? (
                <span className="badge badge-rose" style={{ fontSize: '0.65rem' }}>URGENT</span>
              ) : timeLeft <= 300 ? (
                <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>WARNING</span>
              ) : null}
            </div>
          </div>

          {/* Web Cam Monitor */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>AI PROCTOR STREAM</span>
              <span className={`badge ${camStatus === 'active' ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '0.65rem' }}>
                {modelLoading ? 'LOADING AI...' : camStatus.toUpperCase()}
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '130px',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'black',
              position: 'relative',
              border: '1px solid var(--border-glass)'
            }}>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)' // Mirror feed
                }}
              />
              <canvas ref={canvasRef} width={320} height={240} style={{ display: 'none' }} />
              
              {/* Overlay countdown when taking snapshot */}
              {captureCountdown !== null && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: 'var(--accent-cyan)'
                }}>
                  {captureCountdown}
                </div>
              )}
            </div>
          </div>

          {/* Question Grid Index */}
          <div style={{ marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
              QUESTIONS INDEX
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                const isAnswered = ans && (Array.isArray(ans) ? ans.length > 0 : String(ans).trim() !== '');
                const isCurrent = idx === currentIdx;
                const isFlagged = flagged[q.id];

                let btnStyle = {
                  padding: '0.4rem 0',
                  borderRadius: '6px',
                  border: '1px solid var(--border-glass)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.8rem',
                  transition: 'var(--transition-smooth)'
                };

                if (isCurrent) {
                  btnStyle.background = 'var(--accent-cyan)';
                  btnStyle.color = '#0b0f19';
                  btnStyle.borderColor = 'var(--accent-cyan)';
                } else if (isFlagged) {
                  btnStyle.background = 'rgba(157, 78, 221, 0.2)';
                  btnStyle.color = 'var(--accent-purple)';
                  btnStyle.borderColor = 'rgba(157, 78, 221, 0.5)';
                } else if (isAnswered) {
                  btnStyle.background = 'rgba(16, 185, 129, 0.15)';
                  btnStyle.color = 'var(--accent-emerald)';
                  btnStyle.borderColor = 'rgba(16, 185, 129, 0.4)';
                } else {
                  btnStyle.background = 'rgba(255,255,255,0.02)';
                  btnStyle.color = 'var(--text-secondary)';
                }

                return (
                  <button key={q.id} style={btnStyle} onClick={() => setCurrentIdx(idx)}>
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            
            {/* Index Legend */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginTop: '0.75rem',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              borderTop: '1px solid var(--border-glass)',
              paddingTop: '0.6rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)' }} /> Current
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-emerald)' }} /> Answered
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-purple)' }} /> Flagged
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)' }} /> Unanswered
              </div>
            </div>
          </div>
        </div>

        {/* Action Submit */}
        <button 
          onClick={handleManualSubmit} 
          className="btn-danger" 
          style={{ width: '100%', gap: '0.5rem', opacity: Object.values(wordErrors).some(err => err !== null) ? 0.5 : 1 }} 
          disabled={Object.values(wordErrors).some(err => err !== null)}
        >
          <Send size={16} /> Submit Exam
        </button>
      </div>
      
      {/* Main Exam Window */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        
        {/* Warnings timeline top */}
        {warnings.length > 0 && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.08)',
            borderBottom: '1px solid rgba(244, 63, 94, 0.2)',
            padding: '0.75rem 2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--accent-rose)',
            fontSize: '0.85rem'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span><strong>Proctor Warning:</strong> {warnings[0]}</span>
          </div>
        )}

        <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto', padding: '2.5rem 2rem' }}>
          <div className="glass-panel" style={{ padding: '2.5rem', minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            
            {/* Question Details */}
            <div style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
                <span className="badge badge-cyan" style={{ fontSize: '0.8rem' }}>
                  Question {currentIdx + 1} of {totalQ}
                </span>
                
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button
                    onClick={() => toggleFlag(currentQ.id)}
                    className="btn-secondary"
                    style={{
                      padding: '0.2rem 0.6rem',
                      fontSize: '0.75rem',
                      borderColor: flagged[currentQ.id] ? 'var(--accent-purple)' : 'var(--border-glass)',
                      background: flagged[currentQ.id] ? 'rgba(157, 78, 221, 0.1)' : 'transparent',
                      color: flagged[currentQ.id] ? 'var(--accent-purple)' : 'var(--text-secondary)'
                    }}
                  >
                    {flagged[currentQ.id] ? '★ Flagged' : '☆ Flag for Review'}
                  </button>
                  <span className="badge badge-purple" style={{ fontSize: '0.8rem' }}>
                    {currentQ.points} Points
                  </span>
                </div>
              </div>

              <h2 style={{ fontSize: '1.3rem', fontWeight: '600', marginBottom: '1.5rem', lineHeight: '1.6', userSelect: 'none' }}>
                {currentQ.text}
              </h2>

              {currentQ.reference_file_url && (
                <div style={{ marginBottom: '1.5rem', background: 'rgba(0, 242, 254, 0.05)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(0, 242, 254, 0.2)', fontSize: '0.85rem' }}>
                  📄 <strong>Question Reference Attachment:</strong> <a href={`http://localhost:8000${currentQ.reference_file_url}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'underline', marginLeft: '0.5rem' }}>View / Download Reference File</a>
                </div>
              )}

              {/* Render MCQ with Radio buttons */}
              {currentQ.type === 'mcq' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {currentQ.options.map((opt, i) => {
                    const isSelected = answers[currentQ.id] === opt;
                    return (
                      <button
                        key={i}
                        onClick={() => handleAnswerSelect(currentQ.id, opt)}
                        style={{
                          textAlign: 'left',
                          padding: '1rem 1.25rem',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-glass)',
                          background: isSelected ? 'rgba(0, 242, 254, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                          color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)',
                          fontWeight: isSelected ? '600' : '400',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: `1.5px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--text-secondary)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {isSelected && (
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)' }} />
                          )}
                        </div>
                        <div>
                          <span style={{ marginRight: '0.4rem', fontWeight: 'bold' }}>{String.fromCharCode(65 + i)}.</span>
                          {opt}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Render Multi-select with Checkboxes */}
              {currentQ.type === 'multiselect' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {currentQ.options.map((opt, i) => {
                    const selectedList = answers[currentQ.id] || [];
                    const isSelected = selectedList.includes(opt);
                    return (
                      <button
                        key={i}
                        onClick={() => handleMultiSelectToggle(currentQ.id, opt)}
                        style={{
                          textAlign: 'left',
                          padding: '1rem 1.25rem',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-glass)',
                          background: isSelected ? 'rgba(0, 242, 254, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                          color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)',
                          fontWeight: isSelected ? '600' : '400',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '3px',
                          border: `1.5px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--text-secondary)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          background: isSelected ? 'var(--accent-cyan)' : 'transparent'
                        }}>
                          {isSelected && <Check size={12} style={{ color: '#0b0f19' }} />}
                        </div>
                        <div>
                          <span style={{ marginRight: '0.4rem', fontWeight: 'bold' }}>{String.fromCharCode(65 + i)}.</span>
                          {opt}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Render Short/Long Subjective text */}
              {['short', 'long'].includes(currentQ.type) && (
                <div>
                  <textarea
                    className="glass-input"
                    rows={currentQ.type === 'short' ? 4 : 8}
                    placeholder="Type your response here..."
                    value={answers[currentQ.id] || ''}
                    onChange={(e) => handleTextChange(currentQ.id, e.target.value, currentQ.type)}
                    style={{ 
                      fontSize: '1rem', 
                      lineHeight: '1.5', 
                      fontFamily: 'inherit',
                      borderColor: wordErrors[currentQ.id] ? 'var(--accent-rose)' : 'var(--border-glass)'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                    <div style={{ color: 'var(--accent-rose)', fontSize: '0.8rem' }}>
                      {wordErrors[currentQ.id] || ''}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Word Count: {((answers[currentQ.id] || '').trim().split(/\s+/).filter(Boolean)).length}
                    </div>
                  </div>
                </div>
              )}

              {/* Render Image upload with Drag & Drop / Camera capture + Preview */}
              {['image', 'image_upload', 'handwritten'].includes(currentQ.type) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {answers[currentQ.id] && !localImagePreview ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.02)' }}>
                      <span className="badge badge-emerald">Handwritten Answer Uploaded Successfully</span>
                      <img 
                        src={`http://localhost:8000${answers[currentQ.id]}`} 
                        alt="Handwritten Submission" 
                        style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}
                      />
                      <button 
                        onClick={() => handleAnswerSelect(currentQ.id, null)} 
                        className="btn-secondary" 
                        style={{ fontSize: '0.85rem' }}
                      >
                        Re-upload or Take New Capture
                      </button>
                    </div>
                  ) : localImagePreview ? (
                    /* Local image Preview before submission */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem', border: '1px solid var(--accent-cyan)', borderRadius: '12px', background: 'rgba(0, 242, 254, 0.02)' }}>
                      <div style={{ textAlign: 'center' }}>
                        <span className="badge badge-cyan" style={{ marginBottom: '0.5rem' }}>Preview Before Final Submission</span>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Review your photo below before clicking confirm upload.</p>
                      </div>
                      <img 
                        src={localImagePreview} 
                        alt="Preview" 
                        style={{ maxWidth: '100%', maxHeight: '280px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}
                      />
                      <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
                        <button 
                          onClick={() => { setLocalImageFile(null); setLocalImagePreview(null); }} 
                          className="btn-secondary"
                          style={{ minWidth: '120px' }}
                          disabled={uploadingImage}
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleConfirmUpload(currentQ.id)} 
                          className="btn-primary"
                          style={{ minWidth: '160px' }}
                          disabled={uploadingImage}
                        >
                          {uploadingImage ? 'Uploading...' : 'Confirm & Upload'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Initial selector with drag-and-drop / web camera triggers */
                    <div 
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); handleLocalImageSelect(e.dataTransfer.files[0]); }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2.5rem 2rem',
                        border: dragging ? '2px dashed var(--accent-cyan)' : '2px dashed var(--border-glass)',
                        borderRadius: '12px',
                        background: dragging ? 'rgba(0, 242, 254, 0.03)' : 'rgba(255,255,255,0.01)',
                        transition: 'all 0.2s ease',
                        textAlign: 'center'
                      }}
                    >
                      <Upload size={40} style={{ color: dragging ? 'var(--accent-cyan)' : 'var(--text-muted)', marginBottom: '0.5rem' }} />
                      <div>
                        <p style={{ fontWeight: '600', marginBottom: '0.25rem', fontSize: '1rem' }}>Upload Handwritten Photo</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                          Drag and drop your image here, browse files, or capture a screenshot of your work directly using your exam camera.
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
                        <label className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          Choose Image File
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => handleLocalImageSelect(e.target.files[0])} 
                            style={{ display: 'none' }} 
                          />
                        </label>
                        
                        <button 
                          onClick={captureFromWebcam}
                          className="btn-primary" 
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <Camera size={16} /> Snap Photo via Webcam
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Render PDF upload */}
              {['pdf', 'pdf_upload'].includes(currentQ.type) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {answers[currentQ.id] ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.02)' }}>
                      <span className="badge badge-emerald">PDF Document Uploaded Successfully</span>
                      <p style={{ fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>File: {answers[currentQ.id].split('/').pop()}</p>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <a href={`http://localhost:8000${answers[currentQ.id]}`} target="_blank" rel="noreferrer" className="btn-primary" style={{ fontSize: '0.85rem' }}>
                          View PDF Document
                        </a>
                        <button onClick={() => handleAnswerSelect(currentQ.id, null)} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                          Re-upload PDF
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 2rem', border: '2px dashed var(--border-glass)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', textAlign: 'center' }}>
                      <Upload size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                      <div>
                        <p style={{ fontWeight: '600', marginBottom: '0.25rem', fontSize: '1rem' }}>Upload PDF Document</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                          Select or drag and drop your PDF answer document for this question (.pdf format allowed).
                        </p>
                      </div>
                      <label className="btn-primary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Choose PDF File
                        <input type="file" accept=".pdf" onChange={(e) => handleGeneralFileUpload(currentQ.id, e.target.files[0])} style={{ display: 'none' }} />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Render CS / Code file upload */}
              {['cs_file', 'code_upload', 'code'].includes(currentQ.type) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {answers[currentQ.id] ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.02)' }}>
                      <span className="badge badge-emerald">CS / Code File Uploaded Successfully</span>
                      <p style={{ fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>File: {answers[currentQ.id].split('/').pop()}</p>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <a href={`http://localhost:8000${answers[currentQ.id]}`} target="_blank" rel="noreferrer" className="btn-primary" style={{ fontSize: '0.85rem' }}>
                          View / Download Code File
                        </a>
                        <button onClick={() => handleAnswerSelect(currentQ.id, null)} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                          Re-upload Code File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 2rem', border: '2px dashed var(--border-glass)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', textAlign: 'center' }}>
                      <Upload size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                      <div>
                        <p style={{ fontWeight: '600', marginBottom: '0.25rem', fontSize: '1rem' }}>Upload CS / Code Source File</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                          Upload your source code solution (.cs, .java, .py, .cpp, .js, .txt file formats).
                        </p>
                      </div>
                      <label className="btn-primary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Choose Code File
                        <input type="file" accept=".cs,.java,.py,.cpp,.c,.h,.js,.ts,.txt" onChange={(e) => handleGeneralFileUpload(currentQ.id, e.target.files[0])} style={{ display: 'none' }} />
                      </label>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>
              <button
                onClick={() => setCurrentIdx(prev => Math.max(prev - 1, 0))}
                className="btn-secondary"
                disabled={currentIdx === 0}
                style={{ opacity: currentIdx === 0 ? 0.5 : 1, cursor: currentIdx === 0 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              
              <button
                onClick={() => setCurrentIdx(prev => Math.min(prev + 1, totalQ - 1))}
                className="btn-secondary"
                disabled={currentIdx === totalQ - 1 || Object.values(wordErrors).some(err => err !== null)}
                style={{ 
                  opacity: (currentIdx === totalQ - 1 || Object.values(wordErrors).some(err => err !== null)) ? 0.5 : 1, 
                  cursor: (currentIdx === totalQ - 1 || Object.values(wordErrors).some(err => err !== null)) ? 'not-allowed' : 'pointer' 
                }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Warning Overlay Modal on first proctor violation */}
      {showWarningModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6, 9, 19, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '500px',
            width: '100%',
            padding: '2.5rem',
            textAlign: 'center',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(244, 63, 94, 0.1) 100%)',
            boxShadow: '0 10px 30px rgba(244, 63, 94, 0.15)'
          }}>
            <ShieldAlert size={48} style={{ color: 'var(--accent-rose)', marginBottom: '1.5rem', margin: '0 auto' }} />
            <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--accent-rose)' }}>
              Proctoring Violation Warning
            </h3>
            <p style={{ color: 'var(--text-primary)', marginBottom: '2.5rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
              {warningModalMsg}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '2rem' }}>
              This is your first warning. Any further proctoring violations (looking away, leaving camera, or tab switching) will increase your exam suspicion score and may result in automatic flagging/disqualification.
            </p>
            <button
              onClick={() => setShowWarningModal(false)}
              className="btn-primary"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--accent-rose), #be123c)',
                color: 'white',
                border: 'none',
                padding: '0.8rem',
                fontWeight: '700'
              }}
            >
              I Understand & Acknowledge
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
