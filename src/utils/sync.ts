import { Student, Question, ExamConfig } from '../types';
import { INITIAL_QUESTIONS, INITIAL_CONFIG } from '../data';

const STUDENTS_KEY = 'proktor_students';
const QUESTIONS_KEY = 'proktor_questions';
const CONFIG_KEY = 'proktor_config';
const SYNC_CHANNEL_NAME = 'proktor_sync_channel';

// Initialize a BroadcastChannel for secure real-time sync between browser tabs
let syncChannel: BroadcastChannel | null = null;
try {
  syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
} catch (e) {
  console.warn('BroadcastChannel is not supported or accessible in this iframe environment.', e);
}

// Helpers for Students
export function getStudents(): Student[] {
  const data = localStorage.getItem(STUDENTS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveStudents(students: Student[], broadcast = true): void {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  if (broadcast && syncChannel) {
    syncChannel.postMessage({ type: 'SYNC_STUDENTS' });
  }
}

// Helpers for Questions
export function getQuestions(): Question[] {
  const data = localStorage.getItem(QUESTIONS_KEY);
  if (!data) {
    saveQuestions(INITIAL_QUESTIONS, false);
    return INITIAL_QUESTIONS;
  }
  return JSON.parse(data);
}

export function saveQuestions(questions: Question[], broadcast = true): void {
  localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions));
  if (broadcast && syncChannel) {
    syncChannel.postMessage({ type: 'SYNC_QUESTIONS' });
  }
}

// Helpers for Config
export function getExamConfig(): ExamConfig {
  const data = localStorage.getItem(CONFIG_KEY);
  if (!data) {
    saveExamConfig(INITIAL_CONFIG, false);
    return INITIAL_CONFIG;
  }
  return JSON.parse(data);
}

export function saveExamConfig(config: ExamConfig, broadcast = true): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (broadcast && syncChannel) {
    syncChannel.postMessage({ type: 'SYNC_CONFIG' });
  }
}

// Subscription helper for react hooks
export function subscribeToSync(callback: (type: string) => void): () => void {
  const handleMessage = (event: MessageEvent) => {
    callback(event.data.type);
  };

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STUDENTS_KEY) {
      callback('SYNC_STUDENTS');
    } else if (event.key === QUESTIONS_KEY) {
      callback('SYNC_QUESTIONS');
    } else if (event.key === CONFIG_KEY) {
      callback('SYNC_CONFIG');
    }
  };

  if (syncChannel) {
    syncChannel.addEventListener('message', handleMessage);
  }
  window.addEventListener('storage', handleStorageChange);

  return () => {
    if (syncChannel) {
      syncChannel.removeEventListener('message', handleMessage);
    }
    window.removeEventListener('storage', handleStorageChange);
  };
}
