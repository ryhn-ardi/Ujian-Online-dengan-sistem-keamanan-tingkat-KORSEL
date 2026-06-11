export interface Question {
  id: string;
  questionText: string;
  options: string[];
  correctAnswerIndex: number; // Index of correct option (0-3)
  correctAnswerIndices?: number[]; // List of correct indices, used for MR (multiple response)
  type?: 'MC' | 'MR'; // 'MC' = Multiple Choice (single), 'MR' = Multiple Response (2 correct answers)
  score?: number; // Custom score for each question
  subjectId?: string; // ID of the subject this question belongs to (e.g. 'sub1' or 'sub2')
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
  answers: Record<string, number | number[]>; // key: questionId, value: selectedOptionIndex or array of indices
  startTime?: string;
  endTime?: string;
  lastActive?: string;
  subjectId?: string; // Selected subject ID ('sub1' or 'sub2')
}

export interface ExamConfig {
  durationMinutes: number;
  examTitle: string;
  subject1Name?: string; // Display name for Subject 1
  subject2Name?: string; // Display name for Subject 2
  strictSecurityEnabled?: boolean; // Whether the strict full-screen validation is active
  maxAllowedViolations?: number; // How many violations are allowed before locking
  clearAnswersOnViolation?: boolean; // Whether to completely clear student answers on violation
  sirenAlarmEnabled?: boolean; // Whether to play a loud siren alarm on violation
}
