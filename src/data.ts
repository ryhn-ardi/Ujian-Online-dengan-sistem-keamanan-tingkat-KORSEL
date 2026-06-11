import { Question } from './types';

export const INITIAL_QUESTIONS: Question[] = [
  {
    id: 'q1',
    questionText: 'Siapakah pencipta lagu kebangsaan "Indonesia Raya"?',
    options: [
      'Ir. Soekarno',
      'W.R. Supratman',
      'Moh. Hatta',
      'Ibu Sud'
    ],
    correctAnswerIndex: 1,
    correctAnswerIndices: [1],
    type: 'MC',
    score: 20
  },
  {
    id: 'q2',
    questionText: 'Lambang dari Sila Kelima Pancasila (Keadilan Sosial bagi Seluruh Rakyat Indonesia) adalah...',
    options: [
      'Bintang',
      'Rantai Emas',
      'Padi dan Kapas',
      'Kepala Banteng'
    ],
    correctAnswerIndex: 2,
    correctAnswerIndices: [2],
    type: 'MC',
    score: 20
  },
  {
    id: 'q3',
    questionText: 'Manakah dari berikut ini yang merupakan planet dalam tata surya kita? (PILIH 2 JAWABAN BENAR)',
    options: [
      'Merkurius',
      'Andromeda',
      'Venus',
      'Alpha Centauri'
    ],
    correctAnswerIndex: 0,
    correctAnswerIndices: [0, 2],
    type: 'MR',
    score: 20
  },
  {
    id: 'q4',
    questionText: 'Benua manakah yang menyandang predikat sebagai benua terkecil di dunia?',
    options: [
      'Eropa',
      'Australia',
      'Afrika',
      'Antartika'
    ],
    correctAnswerIndex: 1,
    correctAnswerIndices: [1],
    type: 'MC',
    score: 20
  },
  {
    id: 'q5',
    questionText: 'Apakah lambang unsur kimia untuk zat Oksigen?',
    options: [
      'H',
      'N',
      'O',
      'C'
    ],
    correctAnswerIndex: 2,
    correctAnswerIndices: [2],
    type: 'MC',
    score: 20
  }
];

export const INITIAL_CONFIG = {
  durationMinutes: 15,
  examTitle: 'ujian berbasis keamanan tingkat korea utara + NASA'
};
