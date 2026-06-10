export interface Question {
  id: string;
  questionText: string;
  options: string[];
  correctAnswerIndex: number; // Index of correct option (0-3)
}

export type StudentStatus = 'BELUM_MULAI' | 'SEDANG_MENGERJAKAN' | 'TERKUNCI' | 'SELESAI';

export interface Student {
  id: string; // Generated id
  name: string;
  absentNumber: string;
  studentClass: string;
  status: StudentStatus;
  violationCount: number;
  lockedReason?: string;
  score?: number;
  correctAnswersCount?: number;
  totalQuestions?: number;
  answers: Record<string, number>; // key: questionId, value: selectedOptionIndex
  startTime?: string;
  endTime?: string;
  lastActive?: string;
}

export interface ExamConfig {
  durationMinutes: number;
  examTitle: string;
}
