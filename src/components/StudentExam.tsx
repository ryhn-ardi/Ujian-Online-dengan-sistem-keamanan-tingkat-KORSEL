import React, { useState, useEffect, useRef } from 'react';
import { Play, AlertTriangle, ShieldAlert, KeyRound, Clock, ChevronLeft, ChevronRight, CheckSquare, Send, CheckCircle, RefreshCw } from 'lucide-react';
import { Student, Question, ExamConfig } from '../types';
import { getStudentFromServer } from '../utils/sync';

// Synthesizer Siren Alarm (Emergency high-frequency sweeping pitch)
function playSirenAlarm() {
  try {
    // 1. Trigger repetitive intense physical vibration to make loud mechanical rattling noise on desks
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([600, 200, 600, 200, 600, 200, 600, 200, 600, 200, 600]);
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const mainGain = ctx.createGain();
    
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    
    osc1.frequency.setValueAtTime(600, ctx.currentTime);
    osc2.frequency.setValueAtTime(800, ctx.currentTime);
    
    lfo.frequency.setValueAtTime(4, ctx.currentTime); // 4 sweeps per second
    lfoGain.gain.setValueAtTime(150, ctx.currentTime); // sweep frequency amplitude
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);
    
    const oscGain1 = ctx.createGain();
    const oscGain2 = ctx.createGain();
    // Maximize wave-shaping level
    oscGain1.gain.setValueAtTime(0.8, ctx.currentTime);
    oscGain2.gain.setValueAtTime(0.7, ctx.currentTime);
    
    osc1.connect(oscGain1);
    osc2.connect(oscGain2);
    
    oscGain1.connect(mainGain);
    oscGain2.connect(mainGain);
    
    mainGain.connect(ctx.destination);
    
    // Play with highly amplified envelope (+250% software boost)
    mainGain.gain.setValueAtTime(0, ctx.currentTime);
    mainGain.gain.linearRampToValueAtTime(2.5, ctx.currentTime + 0.1); // Ultra-loud rise
    mainGain.gain.setValueAtTime(2.5, ctx.currentTime + 4.7);
    mainGain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 5.0); // Fast fall
    
    osc1.start();
    osc2.start();
    lfo.start();
    
    osc1.stop(ctx.currentTime + 5.0);
    osc2.stop(ctx.currentTime + 5.0);
    lfo.stop(ctx.currentTime + 5.0);
    
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 5500);
  } catch (err) {
    console.error('Failed to play synthesized siren sound:', err);
  }
}

interface StudentExamProps {
  student: Student;
  questions: Question[];
  onViolation: (reason: string) => void;
  onSubmitAnswers: (answers: Record<string, number | number[]>) => void;
  onAnswersUpdate?: (answers: Record<string, number | number[]>) => void;
  onStartExam: () => void;
  onExit: () => void;
  config: ExamConfig;
}

export default function StudentExam({
  student,
  questions,
  onViolation,
  onSubmitAnswers,
  onAnswersUpdate,
  onStartExam,
  onExit,
  config
}: StudentExamProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number | number[]>>(student.answers || {});
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [localPasscode, setLocalPasscode] = useState('');
  const [localPasscodeError, setLocalPasscodeError] = useState('');
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isCurrentlyFullscreen, setIsCurrentlyFullscreen] = useState(!!document.fullscreenElement);
  const [examStatus, setExamStatus] = useState(student.status);
  const [isUnlockedOnServer, setIsUnlockedOnServer] = useState(false);

  // Keep local exam status synchronized with student.status prop
  useEffect(() => {
    setExamStatus(student.status);
    if (student.status === 'SEDANG_MENGERJAKAN') {
      setIsUnlockedOnServer(false);
    }
  }, [student.status]);

  // Synchronize local answers state if student answers are reset/modified from parent (e.g. locks/resets)
  useEffect(() => {
    setSelectedAnswers(student.answers || {});
  }, [student.answers]);

  const initialWidth = useRef(window.innerWidth);
  const initialHeight = useRef(window.innerHeight);
  const examStartedRef = useRef(false);
  const lastViolationTime = useRef(0);

  // Set up timer based on remaining time
  useEffect(() => {
    if (examStatus !== 'SEDANG_MENGERJAKAN') return;

    if (!student.startTime) {
      // First time starting
      const endTime = new Date(Date.now() + config.durationMinutes * 60 * 1000).toISOString();
      const startTime = new Date().toISOString();
      setTimeRemaining(config.durationMinutes * 60);
    } else {
      // Resume remaining time
      const end = new Date(student.endTime || '').getTime();
      const remain = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setTimeRemaining(remain);
    }
  }, [examStatus, student.startTime, student.endTime, config.durationMinutes]);

  // Countdown clock loop
  useEffect(() => {
    if (examStatus !== 'SEDANG_MENGERJAKAN' || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto submit when time runs out
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [examStatus, timeRemaining]);

  // Request Fullscreen on entering active exam state
  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setFullscreenFailed(false);
      setIsCurrentlyFullscreen(true);
    } catch (err) {
      console.error('Request fullscreen failed:', err);
      setFullscreenFailed(true);
      setIsCurrentlyFullscreen(false);
    }
  };

  const triggerViolation = (reason: string) => {
    if (config.strictSecurityEnabled === false) return; // Ignore if security is off

    const now = Date.now();
    if (now - lastViolationTime.current < 2500) return; // Prevent double trigger
    lastViolationTime.current = now;

    // Siren alarm if enabled in config
    if (config.sirenAlarmEnabled !== false) {
      playSirenAlarm();
    }

    onViolation(reason);
  };

  // Monitor Fullscreen Exit and Focus shifts (THE PROCTOR SENTINELS)
  useEffect(() => {
    if (examStatus !== 'SEDANG_MENGERJAKAN') return;
    if (config.strictSecurityEnabled === false) return; // Ignore if security is off

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsCurrentlyFullscreen(isFs);
      if (!isFs) {
        triggerViolation('Mencoba Keluar dari Layar Penuh (Fullscreen)');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation('Berpindah Tab / Meminimalkan Jendela Browser');
      }
    };

    const handleWindowBlur = () => {
      // Let standard browser clicks settle, only trigger blur if actually losing active focus
      triggerViolation('Membuka Aplikasi Lain / Melakukan Split Screen / Floating Apps');
    };

    const handleResize = () => {
      const parsedWidthDiff = Math.abs(window.innerWidth - initialWidth.current);
      const parsedHeightDiff = Math.abs(window.innerHeight - initialHeight.current);
      
      // If viewport drops significantly during exam, could be split screen
      if (window.innerWidth < 640 || parsedWidthDiff > 250 || parsedHeightDiff > 200) {
        triggerViolation('Mendeteksi Perubahan Jendela (Split Screen / Floating Apps)');
      }
    };

    // Delay listeners slightly to allow user to enter fullscreen without immediate triggers
    const setupTimer = setTimeout(() => {
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('resize', handleResize);
      examStartedRef.current = true;
    }, 1500);

    return () => {
      clearTimeout(setupTimer);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('resize', handleResize);
    };
  }, [examStatus, config.strictSecurityEnabled]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    const questionObj = questions.find(q => q.id === questionId);
    let updated;

    if (questionObj?.type === 'MR') {
      const currentSelection = Array.isArray(selectedAnswers[questionId])
        ? (selectedAnswers[questionId] as number[])
        : selectedAnswers[questionId] !== undefined && selectedAnswers[questionId] !== null
          ? [selectedAnswers[questionId] as number]
          : [];

      let nextSelection;
      if (currentSelection.includes(optionIndex)) {
        nextSelection = currentSelection.filter(item => item !== optionIndex);
      } else {
        if (currentSelection.length >= 2) {
          // Keep max 2 by replacing the oldest (index 0)
          nextSelection = [...currentSelection.slice(1), optionIndex];
        } else {
          nextSelection = [...currentSelection, optionIndex];
        }
      }
      updated = { ...selectedAnswers, [questionId]: nextSelection };
    } else {
      updated = { ...selectedAnswers, [questionId]: optionIndex };
    }

    setSelectedAnswers(updated);
    // Silent background sync
    student.answers = updated;
    if (onAnswersUpdate) {
      onAnswersUpdate(updated);
    }
  };

  const handleAutoSubmit = () => {
    // Escape fullscreen peacefully
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onSubmitAnswers(selectedAnswers);
  };

  const triggerDirectSubmit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onSubmitAnswers(selectedAnswers);
  };

  const handleUnlockWithCode = () => {
    if (localPasscode === 'monyetkukus') {
      setLocalPasscode('');
      setLocalPasscodeError('');
      // Force request fullscreen and unlock
      requestFullscreen();
      // Directly trigger reset local status
      setExamStatus('SEDANG_MENGERJAKAN');
      onViolation('unlocked_locally');
    } else {
      setLocalPasscodeError('Kata sandi pengawas keliru!');
    }
  };

  const handleAutoUnlockCheck = async () => {
    setIsCheckingStatus(true);
    setStatusMessage('Menghubungkan ke proktor...');
    
    try {
      const serverStudent = await getStudentFromServer(student.id);
      if (serverStudent) {
        if (serverStudent.status !== 'TERKUNCI') {
          setStatusMessage('KUNCI TELAH DIBUKA OLEH PROKTOR! Mensinkronisasikan status & memuat ulang lembar ujian Anda...');
          setIsUnlockedOnServer(true);
          onViolation('unlocked_locally');
          
          // Automatically trigger page reload after 1.5 seconds so the student returns cleanly
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setStatusMessage('Sesi Anda masih Terkunci pada sistem Proktor. Silakan lapor ke pengawas Anda untuk menekan tombol "Unlock" terlebih dahulu.');
          setIsUnlockedOnServer(false);
        }
      } else {
        setStatusMessage('Gagal mengambil data terbaru dari server. Coba lagi.');
        setIsUnlockedOnServer(false);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Kesalahan koneksi ke server.');
      setIsUnlockedOnServer(false);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // 1. --- RENDERING: TERKUNCI MODE (BLOCKED EXAM) ---
  if (examStatus === 'TERKUNCI') {
    return (
      <div className="fixed inset-0 bg-red-600 flex flex-col justify-center items-center p-6 text-white text-center z-50 overflow-hidden font-sans">
        <div className="max-w-md w-full bg-red-700/80 rounded-3xl p-8 border border-white/20 shadow-2xl backdrop-blur-md">
          <div className="inline-flex items-center justify-center p-4 bg-white/10 rounded-2xl mb-6">
            <ShieldAlert className="w-16 h-16 text-yellow-300 animate-bounce" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 uppercase">Akses Terblokir!</h1>
          <p className="text-sm text-red-100 font-mono mb-6">INTEGRITY & PROCTOR VIOLATION REGISTERED</p>

          <div className="bg-red-950/40 p-4 border border-white/10 rounded-xl text-left mb-6 space-y-2">
            <div className="text-xs text-red-200 uppercase tracking-wider font-mono font-bold">Identitas Siswa:</div>
            <div className="text-sm font-semibold">{student.name} (Absen {student.absentNumber}) / Kelas {student.studentClass}</div>
            <div className="text-xs text-red-200 uppercase tracking-wider font-mono font-bold mt-3">Alasan Kunci:</div>
            <div className="text-sm font-semibold text-yellow-300">{student.lockedReason || 'Mencoba berpindah layar/tab'}</div>
          </div>

          <p className="text-sm text-red-100 leading-relaxed mb-6">
            Sistem pengawasan mendeteksi tindakan tidak aman. Lembar ujian Anda telah dibekukan. Harap melapor kepada Pengawas/Proktor kelas untuk membuka kunci ujian Anda atau klik tombol refresh di bawah.
          </p>

          {/* Real-time Buka Kunci tanpa Password Button */}
          <div className="mb-6 p-4 bg-emerald-950/45 border border-emerald-500/20 rounded-2xl text-left">
            <h3 className="text-xs font-bold text-emerald-400 font-mono tracking-wider mb-2 uppercase">Metode 1: Buka Kunci Tanpa Sandi</h3>
            <button
              type="button"
              id="btn-auto-unlock-refresh"
              onClick={handleAutoUnlockCheck}
              disabled={isCheckingStatus}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 text-slate-950 font-black py-3 px-4 rounded-xl shadow-md transition duration-150 flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer active:scale-[0.98]"
            >
              {isCheckingStatus ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Memeriksa Status Proktor...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Cek & Buka Kunci Otomatis
                </>
              )}
            </button>
            
            {statusMessage ? (
              <p className="text-xs text-yellow-300 font-semibold mt-2 leading-relaxed font-sans">
                {statusMessage}
              </p>
            ) : (
              <p className="text-[11px] text-emerald-200 mt-2 leading-tight">
                Jika Proktor sudah membuka kunci Anda dari admin panel, klik tombol hijau di atas untuk langsung kembali melanjutkan ujian secara otomatis tanpa password.
              </p>
            )}

            {isUnlockedOnServer && (
              <button
                type="button"
                id="btn-final-auto-unlock-enter-fs"
                onClick={async () => {
                  await requestFullscreen();
                  setExamStatus('SEDANG_MENGERJAKAN');
                  onViolation('unlocked_locally');
                  setIsUnlockedOnServer(false);
                  setStatusMessage('');
                }}
                className="mt-3.5 w-full bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-lg transition duration-150 flex items-center justify-center gap-2 text-xs uppercase tracking-wider animate-pulse cursor-pointer border border-white/20 active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-current text-slate-950" />
                Masuk Layar Ujian (Layar Penuh)
              </button>
            )}
          </div>

          <div className="border-t border-white/20 pt-6">
            <p className="text-xs text-red-200 font-mono uppercase mb-3">Metode 2: Masukkan Kode Pengawas (Manual)</p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Kode Pengawas Kelas"
                value={localPasscode}
                onChange={(e) => setLocalPasscode(e.target.value)}
                className="flex-1 px-3 py-2 bg-red-950 border border-white/20 rounded-lg text-white font-serif text-center placeholder-red-300 focus:outline-none focus:ring-1 focus:ring-white text-sm"
              />
              <button
                id="btn-unlock-locally"
                onClick={handleUnlockWithCode}
                className="bg-yellow-400 hover:bg-yellow-300 text-red-950 font-bold px-4 py-2 rounded-lg transition text-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4" />
                Unlock
              </button>
            </div>
            {localPasscodeError && (
              <p className="text-xs text-yellow-300 font-semibold mt-2">{localPasscodeError}</p>
            )}
            <p className="text-[10px] text-red-200 mt-4 leading-normal italic">
              *Proktor utama juga dapat menekan tombol "Unlock" pada layar utama Admin secara real-time dari komputer pengawas kelas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 1b. --- RENDERING: BLOCKED SCENE IF EXITING FULLSCREEN ---
  if (config.strictSecurityEnabled !== false && !isCurrentlyFullscreen && examStatus === 'SEDANG_MENGERJAKAN') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 text-white text-center font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-red-600 animate-pulse"></div>
          
          <div className="inline-flex items-center justify-center p-4 bg-red-500/10 rounded-2xl mb-6 text-red-500">
            <AlertTriangle className="w-12 h-12" />
          </div>
          
          <h2 className="text-xl font-extrabold tracking-tight text-red-400 mb-2 uppercase">Layar Ujian Dibekukan</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            Anda terdeteksi keluar dari mode Layar Penuh (Fullscreen). Silakan klik tombol di bawah untuk masuk kembali ke mode ujian.
          </p>

          <div className="bg-slate-950/85 p-4 rounded-xl border border-white/5 mb-6 text-left text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Siswa:</span>
              <span className="text-white font-bold">{student.name}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Pelanggaran Saat Ini:</span>
              <span className="text-red-400 font-bold">{student.violationCount || 0} Kali</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Batas Toleransi:</span>
              <span className="text-yellow-400 font-bold">{config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3} Kali</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Sisa Kesempatan:</span>
              <span className="text-emerald-400 font-extrabold">
                {Math.max(0, (config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3) - (student.violationCount || 0))} Kali
              </span>
            </div>
          </div>

          <button
            type="button"
            id="btn-re-enter-fullscreen"
            onClick={async () => {
              await requestFullscreen();
            }}
            className="w-full bg-red-650 bg-red-600 hover:bg-red-500 text-white font-black py-3.5 px-6 rounded-xl transition duration-155 flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            Kembali ke Layar Penuh (Ujian)
          </button>
        </div>
      </div>
    );
  }

  // 2. --- RENDERING: PINDAH LAYAR PENUH INTI ---
  if (examStatus === 'BELUM_MULAI') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 text-white text-center font-sans">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-xl">
          <div className="inline-flex items-center justify-center p-4 bg-teal-500/10 rounded-2xl mb-6 text-teal-400">
            <Play className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Masuk Layar Pengawasan</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Untuk memulai pengerjaan, Anda harus menyetujui program masuk ke Layar Penuh. Hal ini mencegah gangguan selama ujian berlangsung.
          </p>

          {fullscreenFailed && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs text-left">
              Gagal mematikan mode desktop normal. Pastikan izin fullscreen aktif di browser Anda atau tekan tombol manual di bawah ini.
            </div>
          )}

          <div className="space-y-3">
            <button
              id="btn-trigger-fullscreen-start"
              onClick={async () => {
                await requestFullscreen();
                onStartExam();
              }}
              className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-lg"
            >
              Masukkan Layar Penuh & Mulai
            </button>
            <button
              id="btn-abort-exam"
              onClick={onExit}
              className="w-full bg-transparent hover:bg-slate-700 font-semibold text-slate-300 border border-slate-600/50 py-2.5 rounded-xl transition duration-150 text-sm"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. --- RENDERING: SOAL AKTIF (ACTIVE EXAM SESSION) ---
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans relative select-none">
      {/* Header Panel */}
      <header className="bg-slate-900 text-white shadow-sm border-b border-slate-800 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-red-600 text-white font-mono text-[10px] font-bold tracking-widest rounded uppercase">
                PROCTOR ACTIVE
              </span>
              <span className="text-slate-400 text-xs font-mono">
                KELAS {student.studentClass} • ABSEN {student.absentNumber}
              </span>
            </div>
            <h2 className="text-lg font-bold truncate tracking-tight">{student.name}</h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Timer countdown view */}
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl text-yellow-400 font-mono font-bold text-lg min-w-[120px] justify-center shadow-inner">
              <Clock className="w-5 h-5 shrink-0" />
              <span>{formatTime(timeRemaining)}</span>
            </div>

            <button
              id="btn-direct-submit-header"
              onClick={() => setShowConfirmSubmit(true)}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-sm transition flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              Kirim
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="max-w-5xl mx-auto w-full flex-1 px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Hand: Question Box */}
        <section className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 md:p-8 relative">
            
            {/* Index heading */}
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold text-indigo-500 uppercase font-mono tracking-widest">
                Pertanyaan {currentQuestionIndex + 1} dari {questions.length}
              </span>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-xs rounded-full font-semibold font-mono">
                {selectedAnswers[currentQuestion.id] !== undefined && 
                 (!Array.isArray(selectedAnswers[currentQuestion.id]) || (selectedAnswers[currentQuestion.id] as number[]).length > 0)
                  ? `✓ Terjawab${currentQuestion.type === 'MR' ? ` (${(selectedAnswers[currentQuestion.id] as number[]).length}/2)` : ''}`
                  : '• Belum Terjawab'}
              </span>
            </div>

            {currentQuestion.type === 'MR' && (
              <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-850 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 mr-1 shrink-0 animate-ping" />
                <span>PILIHAN GANDA 2 JAWABAN: Pilih tepat 2 (dua) opsi jawaban yang benar!</span>
              </div>
            )}

            {/* Question Text */}
            <h3 className="text-lg font-bold text-slate-800 leading-relaxed mb-8">
              {currentQuestion.questionText}
            </h3>

            {/* Multiple Choice Options */}
            <div className="space-y-4">
              {currentQuestion.options.map((option, idx) => {
                const labelLetter = String.fromCharCode(65 + idx); // A, B, C, D
                const qAns = selectedAnswers[currentQuestion.id];
                const isSelected = Array.isArray(qAns) ? qAns.includes(idx) : qAns === idx;
                
                return (
                  <button
                    key={idx}
                    id={`btn-option-${idx}`}
                    onClick={() => handleSelectOption(currentQuestion.id, idx)}
                    className={`w-full text-left px-5 py-4 rounded-xl border text-sm transition-all flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-500 text-indigo-900 font-semibold ring-1 ring-indigo-500'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-mono text-sm border shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-700 text-white'
                          : 'bg-white border-slate-300 text-slate-500'
                      }`}>
                        {labelLetter}
                      </span>
                      <span className="leading-snug">{option}</span>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between">
            <button
              id="btn-prev-question"
              disabled={currentQuestionIndex === 0}
              onClick={() => setCurrentQuestionIndex((p) => p - 1)}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-1 text-sm shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
              Kembali
            </button>

            {currentQuestionIndex < questions.length - 1 ? (
              <button
                id="btn-next-question"
                onClick={() => setCurrentQuestionIndex((p) => p + 1)}
                className="px-5 py-2.5 bg-slate-900 border border-slate-950 text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center gap-1 text-sm shadow-xs"
              >
                Selanjutnya
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="btn-finish-exam"
                onClick={() => setShowConfirmSubmit(true)}
                className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-extrabold transition flex items-center gap-1 text-sm shadow-sm"
              >
                Selesaikan Ujian
                <CheckCircle className="w-5 h-5 text-slate-950" />
              </button>
            )}
          </div>
        </section>

        {/* Right Hand: Question Grid Index */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-6 h-fit">
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 font-mono uppercase tracking-wide">
            <CheckSquare className="w-4 h-4 text-indigo-500" />
            Navigasi Lembar Soal
          </h4>
          
          <div className="grid grid-cols-5 gap-2.5">
            {questions.map((q, idx) => {
              const qAns = selectedAnswers[q.id];
              const isAnswered = qAns !== undefined && qAns !== null && (!Array.isArray(qAns) || qAns.length > 0);
              const isCurrent = currentQuestionIndex === idx;

              return (
                <button
                  key={q.id}
                  id={`btn-nav-sq-${idx}`}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={`aspect-square rounded-xl text-xs font-bold font-mono transition-all border flex items-center justify-center ${
                    isCurrent
                      ? 'bg-indigo-600 border-indigo-700 text-white ring-2 ring-indigo-250'
                      : isAnswered
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  {(idx + 1).toString().padStart(2, '0')}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-indigo-600 rounded"></span>
              <span>Posisi Soal Aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-emerald-100 border border-emerald-300 rounded"></span>
              <span>Sudah Terjawab</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-slate-50 border border-slate-200 rounded"></span>
              <span>Belum Dikerjakan</span>
            </div>
          </div>
        </section>
      </main>

      {/* Strict Guardian Warning watermark at bottom */}
      <footer className="bg-slate-100 text-center py-3 text-[10px] text-slate-400 font-mono tracking-wider border-t border-slate-200 select-none">
        PROKTOR AKTIF • KUNCI MANDIRI • JANGAN KELUAR FULLSCREEN ATAU BERPINDAH TAB
      </footer>

      {/* Manual Submit Confirmation Dialog */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 text-center animate-fade-in">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Selesaikan Ujian?</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Anda telah menjawab {Object.keys(selectedAnswers).length} dari {questions.length} soal. Setelah Anda mengonfirmasi pengiriman, jawaban Anda tidak dapat diubah lagi.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                id="btn-cancel-submit"
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-submit-active"
                onClick={triggerDirectSubmit}
                className="flex-1 py-2.5 text-sm font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-md"
              >
                Ya, Kirim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
