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
    correctAnswerIndex: 1
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
    correctAnswerIndex: 2
  },
  {
    id: 'q3',
    questionText: 'Planet manakah yang letaknya paling dekat dengan Matahari dalam tata surya kita?',
    options: [
      'Venus',
      'Mars',
      'Yupiter',
      'Merkurius'
    ],
    correctAnswerIndex: 3
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
    correctAnswerIndex: 1
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
    correctAnswerIndex: 2
  }
];

export const INITIAL_CONFIG = {
  durationMinutes: 15,
  examTitle: 'Ujian Tengah Semester - Pengetahuan Umum'
};
