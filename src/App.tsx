import React, { useState, useEffect } from 'react';
import { getStudents, saveStudents, getQuestions, saveQuestions, getExamConfig, saveExamConfig, subscribeToSync, isInitialSyncCompleted } from './utils/sync';
import { Student, Question, ExamConfig, StudentStatus } from './types';
import StudentRegistration from './components/StudentRegistration';
import StudentExam from './components/StudentExam';
import AdminPanel from './components/AdminPanel';
import { ShieldCheck, GraduationCap, Award, RefreshCw, XCircle, ArrowRight, CheckCircle2, ChevronRight, AlertTriangle, BookOpen } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState<'SETUP' | 'STUDENT_EXAM' | 'STUDENT_FINISHED' | 'ADMIN'>('SETUP');
  const [students, setStudents] = useState<Student[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [config, setConfig] = useState<ExamConfig>({ durationMinutes: 15, examTitle: '' });
  const [currentStudentId, setCurrentStudentId] = useState<string>('');
  const [isDbSynced, setIsDbSynced] = useState<boolean>(false);

  // 1. Load initial states on mount
  useEffect(() => {
    setStudents(getStudents());
    setQuestions(getQuestions());
    setConfig(getExamConfig());
    setIsDbSynced(isInitialSyncCompleted());

    // 2. Subscribe to real-time tab updates
    const unsubscribe = subscribeToSync((syncType) => {
      if (syncType === 'SYNC_STUDENTS') {
        const freshStudents = getStudents();
        setStudents(freshStudents);
      } else if (syncType === 'SYNC_QUESTIONS') {
        setQuestions(getQuestions());
      } else if (syncType === 'SYNC_CONFIG') {
        setConfig(getExamConfig());
      }
      setIsDbSynced(isInitialSyncCompleted());
    });

    return () => unsubscribe();
  }, []);

  // Sync state helpers
  const handleUpdateStudents = (updatedList: Student[]) => {
    setStudents(updatedList);
    saveStudents(updatedList);
  };

  const handleUpdateQuestions = (updatedList: Question[]) => {
    setQuestions(updatedList);
    saveQuestions(updatedList);
  };

  const handleUpdateConfig = (updatedConfig: ExamConfig) => {
    setConfig(updatedConfig);
    saveExamConfig(updatedConfig);
  };

  // 3. STUDENT FLOW: Registration Action
  const handleRegisterStudent = (data: { name: string; absentNumber: string; studentClass: string; subjectId: string }) => {
    const existingStudents = getStudents();
    
    // Create new student session object
    const newStudentId = `siswa_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newStudent: Student = {
      id: newStudentId,
      name: data.name,
      absentNumber: data.absentNumber,
      studentClass: data.studentClass,
      status: 'BELUM_MULAI',
      violationCount: 0,
      answers: {},
      lastActive: new Date().toISOString(),
      subjectId: data.subjectId
    };

    const updated = [...existingStudents, newStudent];
    handleUpdateStudents(updated);
    setCurrentStudentId(newStudentId);
    setRole('STUDENT_EXAM');
  };

  // 3b. STUDENT FLOW: Start Exam Action
  const handleStartExam = () => {
    const freshStudents = getStudents();
    const updated = freshStudents.map((s) => {
      if (s.id === currentStudentId) {
        return {
          ...s,
          status: 'SEDANG_MENGERJAKAN' as const,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + config.durationMinutes * 60 * 1000).toISOString(),
          lastActive: new Date().toISOString()
        };
      }
      return s;
    });
    handleUpdateStudents(updated);
  };

  // 3c. STUDENT FLOW: Save/Update Answers in Real-time
  const handleStudentAnswersUpdate = (updatedAnswers: Record<string, number | number[]>) => {
    const freshStudents = getStudents();
    const updated = freshStudents.map((s) => {
      if (s.id === currentStudentId) {
        return {
          ...s,
          answers: updatedAnswers,
          lastActive: new Date().toISOString()
        };
      }
      return s;
    });
    handleUpdateStudents(updated);
  };

  // 4. STUDENT FLOW: Violation detection (Strict lock trigger)
  const handleStudentViolation = (reason: string) => {
    const freshStudents = getStudents(); // pull fresh to preserve parallel answers
    const updated = freshStudents.map((s) => {
      if (s.id === currentStudentId) {
        if (reason === 'unlocked_locally') {
          // Unlocked locally via supervisor code entry on student seat
          return {
            ...s,
            status: 'SEDANG_MENGERJAKAN' as const,
            lockedReason: undefined
          };
        }

        // Lock exam immediately
        return {
          ...s,
          status: 'TERKUNCI' as const,
          lockedReason: reason,
          violationCount: (s.violationCount || 0) + 1,
          answers: {},
          lastActive: new Date().toISOString()
        };
      }
      return s;
    });

    handleUpdateStudents(updated);
  };

  // 5. STUDENT FLOW: Final Answers Submission & Calculation
  const handleStudentSubmit = (selectedAnswers: Record<string, number | number[]>) => {
    const freshStudents = getStudents();
    const currentStudentObj = freshStudents.find(s => s.id === currentStudentId);
    if (!currentStudentObj) return;

    // Direct Score assessment
    let correctCount = 0;
    let earnedPoints = 0;
    let maxPoints = 0;

    questions.forEach((q) => {
      const qScore = typeof q.score === 'number' ? q.score : 10;
      maxPoints += qScore;

      const ans = selectedAnswers[q.id];
      if (ans !== undefined) {
        if (q.type === 'MR') {
          const correctSet = q.correctAnswerIndices || [];
          const studentSet = Array.isArray(ans) ? ans : [ans];
          const isCorrect = studentSet.length === correctSet.length &&
            studentSet.every(idx => correctSet.includes(idx));
          
          if (isCorrect) {
            correctCount++;
            earnedPoints += qScore;
          }
        } else {
          // MC
          const correctIdx = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : (q.correctAnswerIndices?.[0] ?? 0);
          const isCorrect = Array.isArray(ans) ? ans.includes(correctIdx) : ans === correctIdx;
          if (isCorrect) {
            correctCount++;
            earnedPoints += qScore;
          }
        }
      }
    });

    const finalScore = maxPoints > 0 ? (earnedPoints / maxPoints) * 100 : 0;

    const updated = freshStudents.map((s) => {
      if (s.id === currentStudentId) {
        return {
          ...s,
          status: 'SELESAI' as const,
          answers: selectedAnswers,
          correctAnswersCount: correctCount,
          totalQuestions: questions.length,
          score: finalScore,
          endTime: new Date().toISOString(),
          lastActive: new Date().toISOString()
        };
      }
      return s;
    });

    handleUpdateStudents(updated);
    setRole('STUDENT_FINISHED');
  };

  // Fetching currently active student object from reactive state
  const activeStudent = students.find((s) => s.id === currentStudentId);

  // Monitor real-time status transitions (e.g. if admin unlocks from their dashboard)
  useEffect(() => {
    if (role === 'STUDENT_EXAM' && activeStudent && activeStudent.status === 'SELESAI') {
      setRole('STUDENT_FINISHED');
    }
  }, [students, role, activeStudent]);

  if (!isDbSynced) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-sm w-full space-y-6">
          <div className="relative flex justify-center">
            {/* Spinning elegant custom loader */}
            <div className="w-16 h-16 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <h2 className="text-white font-bold tracking-tight text-lg">Mempersiapkan Lembar Ujian...</h2>
            <p className="text-[10px] text-indigo-200/50 font-mono text-center tracking-wider px-4">
              SINKRONISASI REAL-TIME DENGAN CLOUD DATABASE
            </p>
          </div>
          
          <div className="bg-slate-800/40 p-4.5 rounded-2xl border border-slate-700/30 text-[10px] font-mono text-slate-400 space-y-2 text-left leading-relaxed">
            <div className="flex items-center justify-between">
              <span>Menghubungkan ke Cloud...</span>
              <span className="text-emerald-400 font-bold">TERKONEKSI</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Membersihkan Cache Presensi...</span>
              <span className="text-indigo-400 font-bold uppercase">OTOMATIS</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Mengunduh Bank Soal Aktif...</span>
              <span className="text-amber-400 font-bold animate-pulse">MEMPROSES</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* 1. SETUP / WELCOME SCREEN */}
      {role === 'SETUP' && (
        <StudentRegistration
          students={students}
          onRegister={handleRegisterStudent}
          onAdminLogin={() => setRole('ADMIN')}
          examTitle={config.examTitle || 'Ujian Digital'}
          durationMinutes={config.durationMinutes}
          totalQuestions={questions.length}
          subject1Name={config.subject1Name}
          subject2Name={config.subject2Name}
        />
      )}

      {/* 2. ACTIVE STUDENT EXAM VIEW */}
      {role === 'STUDENT_EXAM' && activeStudent && (
        <StudentExam
          student={activeStudent}
          questions={questions.filter(q => (!q.subjectId && (!activeStudent.subjectId || activeStudent.subjectId === 'sub1')) || q.subjectId === activeStudent.subjectId)}
          durationMinutes={config.durationMinutes}
          onViolation={handleStudentViolation}
          onStartExam={handleStartExam}
          onSubmitAnswers={handleStudentSubmit}
          onAnswersUpdate={handleStudentAnswersUpdate}
          onExit={() => {
            // Delete incomplete record & exit
            const updated = students.filter(s => s.id !== currentStudentId);
            handleUpdateStudents(updated);
            setRole('SETUP');
          }}
        />
      )}

      {/* 3. STUDENT SCORE & SUBMISSION ANALYSIS PREVIEW */}
      {role === 'STUDENT_FINISHED' && activeStudent && (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
          <div className="max-w-2xl mx-auto">
            
            {/* Header Success Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center relative overflow-hidden mb-6">
              <div className="absolute top-0 inset-x-0 h-2 bg-emerald-500"></div>
              
              <div className="inline-flex items-center justify-center p-3 bg-emerald-50 rounded-full text-emerald-500 mb-4">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Jawaban Berhasil Dikirim!</h1>
              <p className="mt-1 text-sm text-slate-500 font-mono">UJIAN SELESAI • DATA TERKAM REKAM AMAN</p>

              {/* Student Metadata Card info */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 my-6 text-left space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400 font-medium">Nama Siswa:</span> <span className="font-bold text-slate-800">{activeStudent.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 font-medium">No Absen / Kelas:</span> <span className="font-bold text-slate-800">{activeStudent.absentNumber} / {activeStudent.studentClass}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 font-medium">Status Pengawasan:</span> <span className="text-green-600 font-bold flex items-center gap-1">Lulus Verifikasi ({activeStudent.violationCount} Pelanggaran)</span></div>
              </div>

              {/* Real-time score display */}
              <div className="p-6 bg-slate-900 rounded-2xl text-white">
                <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1 font-mono">Nilai Hasil Ujian</span>
                <div className="text-5xl font-black tracking-tight text-yellow-405 text-yellow-400 font-mono">
                  {activeStudent.score !== undefined ? activeStudent.score.toFixed(1) : '0.0'}
                </div>
                <div className="text-xs text-slate-350 mt-2">
                  Berhasil menjawab benar <strong className="text-white">{activeStudent.correctAnswersCount}</strong> dari <strong className="text-white">{activeStudent.totalQuestions}</strong> pertanyaan.
                </div>
              </div>
            </div>

            {/* Answer Key Analysis (Kunci Jawaban & Pembahasan) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 space-y-6">
              <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-4 mb-4">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                Ulasan Jawaban & Pembahasan
              </h2>

              <div className="space-y-6">
                {questions
                  .filter(q => (!q.subjectId && (!activeStudent.subjectId || activeStudent.subjectId === 'sub1')) || q.subjectId === activeStudent.subjectId)
                  .map((q, qIndex) => {
                    const studentAns = activeStudent.answers[q.id];
                  const hasAnswered = studentAns !== undefined && studentAns !== null && (!Array.isArray(studentAns) || studentAns.length > 0);
                  
                  let isCorrect = false;
                  if (hasAnswered) {
                    if (q.type === 'MR') {
                      const correctSet = q.correctAnswerIndices || [];
                      const studentSet = Array.isArray(studentAns) ? studentAns : [studentAns];
                      isCorrect = studentSet.length === correctSet.length &&
                        studentSet.every(idx => correctSet.includes(idx));
                    } else {
                      const correctIdx = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : (q.correctAnswerIndices?.[0] ?? 0);
                      isCorrect = Array.isArray(studentAns) ? studentAns.includes(correctIdx) : studentAns === correctIdx;
                    }
                  }

                  const getStudentAnswerText = () => {
                    if (!hasAnswered) return 'Tidak dijawab';
                    if (Array.isArray(studentAns)) {
                      return studentAns.map(idx => `${String.fromCharCode(65 + idx)}. ${q.options[idx]}`).join(', ');
                    } else {
                      return `${String.fromCharCode(65 + (studentAns as number))}. ${q.options[studentAns as number]}`;
                    }
                  };

                  const getCorrectAnswerText = () => {
                    if (q.type === 'MR') {
                      const correctSet = q.correctAnswerIndices || [];
                      return correctSet.map(idx => `${String.fromCharCode(65 + idx)}. ${q.options[idx]}`).join(', ');
                    } else {
                      const correctIdx = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : (q.correctAnswerIndices?.[0] ?? 0);
                      return `${String.fromCharCode(65 + correctIdx)}. ${q.options[correctIdx]}`;
                    }
                  };

                  return (
                    <div key={q.id} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                      <div className="flex items-start gap-3">
                        <span className={`w-6 h-6 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 border mt-0.5 ${
                          isCorrect
                            ? 'bg-emerald-500 border-emerald-600 text-white'
                            : hasAnswered
                              ? 'bg-rose-500 border-rose-600 text-white'
                              : 'bg-slate-400 border-slate-500 text-white'
                        }`}>
                          {qIndex + 1}
                        </span>
                        
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-800 leading-relaxed text-sm flex-1">{q.questionText}</h4>
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-mono">
                              {q.type === 'MR' ? 'Pilihan Ganda 2 Jawaban (MR)' : 'Pilihan Ganda Tunggal (MC)'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                              <span className="text-slate-400 uppercase tracking-wide font-mono text-[9px] block mb-1">Pilihan Anda:</span>
                              <span className={`font-semibold ${isCorrect ? 'text-emerald-700' : hasAnswered ? 'text-rose-700' : 'text-slate-400'}`}>
                                {getStudentAnswerText()}
                              </span>
                            </div>
 
                            {!isCorrect && (
                              <div className="p-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50">
                                <span className="text-emerald-600 uppercase tracking-wide font-mono text-[9px] block mb-1">Kunci Jawaban Benar:</span>
                                <span className="font-semibold text-emerald-800">
                                  {getCorrectAnswerText()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation Back */}
              <div className="pt-6 border-t border-slate-100 text-center">
                <button
                  id="btn-return-home"
                  onClick={() => {
                    setCurrentStudentId('');
                    setRole('SETUP');
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-xl transition duration-150 flex items-center justify-center gap-1"
                >
                  Selesai & Keluar Aplikasi
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. MASTER ADMIN DASHBOARD CONSOLE */}
      {role === 'ADMIN' && (
        <AdminPanel
          students={students}
          questions={questions}
          config={config}
          onUpdateStudents={handleUpdateStudents}
          onUpdateQuestions={handleUpdateQuestions}
          onUpdateConfig={handleUpdateConfig}
          onExit={() => setRole('SETUP')}
        />
      )}
    </div>
  );
}
