import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Server-side Gemini client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// 1. Generate Notes & Summaries
app.post('/api/gemini/generate-notes', async (req, res) => {
  const { title, topic, content } = req.body;
  const ai = getAiClient();

  if (!ai) {
    // Graceful fallback with rich structured notes
    return res.json({
      success: true,
      data: {
        title: title || 'Structured Study Notes',
        summary: `Comprehensive summary covering foundational principles, core mechanisms, and analytical problem-solving patterns in ${topic || 'the selected subject'}.`,
        quickRevisionSummary: `${topic || 'This topic'} in brief: understand the main definition, learn the core principles, and remember how the key process works. Focus on the important terms and one practical example. Review the key concepts below before your next class or test.`,
        keyConcepts: [
          { concept: 'Fundamental Principle', explanation: 'Core axiom governing the behavior and interaction of primary system components.' },
          { concept: 'Operational Dynamics', explanation: 'How state transitions and feedback loops dictate efficiency and performance under varying loads.' },
          { concept: 'Edge Cases & Constraints', explanation: 'Critical boundary conditions where standard assumptions fail, requiring specialized handlers.' }
        ],
        bulletNotes: [
          'Mastery requires understanding both theoretical guarantees and practical trade-offs.',
          'Key equations and algorithmic steps must be verified for boundary values.',
          'Identify common exam traps: confusing asymptotic worst-case with expected real-world latency.'
        ],
        glossary: [
          { term: 'Asymptotic Bounds', definition: 'Mathematical representation of performance scaling as input size approaches infinity.' },
          { term: 'Invariance', definition: 'A condition that remains consistently true throughout the lifecycle of execution.' }
        ],
        examWatchouts: [
          'Watch out for edge cases with null or zero values.',
          'Avoid conflating space complexity with temporary auxiliary stack allocation.'
        ]
      }
    });
  }

  try {
    const prompt = `You are an expert academic tutor. Analyze the following study material on "${topic || 'General Topic'}" titled "${title || 'Study Material'}":
Content:
"""
${content?.slice(0, 8000) || 'General study material'}
"""

Generate a rigorous, high-yield academic study note summary in JSON format with:
- title: string
- summary: 2-3 paragraph executive overview
- quickRevisionSummary: a very short, student-friendly revision summary in 3-5 concise sentences, covering only the most important points for a student who missed the lecture
- keyConcepts: array of { concept: string, explanation: string }
- bulletNotes: array of 4-6 high-impact takeaway bullet points
- glossary: array of { term: string, definition: string } (3-5 key terms)
- examWatchouts: array of 2-3 common traps, pitfalls, or examiner tricks`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            quickRevisionSummary: { type: Type.STRING },
            keyConcepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  concept: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['concept', 'explanation'],
              },
            },
            bulletNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            glossary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  definition: { type: Type.STRING },
                },
                required: ['term', 'definition'],
              },
            },
            examWatchouts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['title', 'summary', 'quickRevisionSummary', 'keyConcepts', 'bulletNotes', 'glossary', 'examWatchouts'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Gemini generate-notes error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate notes' });
  }
});

// 2. Generate Adaptive Quiz with Socratic Hints
app.post('/api/gemini/generate-quiz', async (req, res) => {
  const { topic, difficulty = 'Adaptive', count = 5, context = '' } = req.body;
  const ai = getAiClient();

  if (!ai) {
    return res.json({
      success: true,
      questions: [
        {
          id: 'q1',
          question: `In ${topic || 'Computer Systems'}, which data structure provides O(1) average lookup time?`,
          options: ['Binary Search Tree', 'Hash Map with chaining', 'Singly Linked List', 'B-Tree'],
          correctIndex: 1,
          explanation: 'Hash Maps provide amortized O(1) time complexity for lookup operations using hash functions and bucket arrays.',
          misconception: 'Assuming Binary Search Trees provide O(1) lookup because of binary subdivision; they provide O(log n).',
          difficulty: 'Easy',
          subtopic: 'Data Structures',
          socraticHints: [
            'Think about how direct array indexing enables immediate memory access.',
            'What mechanism computes an array bucket index directly from an input key?',
            'Eliminate trees and linear lists; consider hashing.'
          ]
        },
        {
          id: 'q2',
          question: `What is the primary cause of Thrashing in operating system virtual memory management?`,
          options: [
            'Excessive CPU cache misses due to false sharing',
            'Total working set of processes exceeding available physical RAM frames',
            'Fragmented disk sectors slowing down I/O DMA channels',
            'Deadlock occurring between memory allocation mutexes'
          ],
          correctIndex: 1,
          explanation: 'Thrashing occurs when the aggregate working set size of active processes exceeds physical memory, causing continuous page faults and page replacement.',
          misconception: 'Blaming disk fragmentation or CPU cache rather than the working set vs physical frame ratio.',
          difficulty: 'Medium',
          subtopic: 'Virtual Memory',
          socraticHints: [
            'Consider what happens when a computer spends more time swapping pages than executing user code.',
            'What is the relationship between the processes active "working set" and physical RAM?',
            'Look for the option describing aggregate memory demand outstripping physical RAM frames.'
          ]
        }
      ]
    });
  }

  try {
    const prompt = `Generate ${count} multiple-choice quiz questions on topic "${topic}". Target difficulty: "${difficulty}".
Context notes: "${context?.slice(0, 4000) || 'None provided'}".

For each question:
- question: Clear, thought-provoking problem testing deep conceptual understanding (not just rote trivia).
- options: Exactly 4 choices.
- correctIndex: 0-3 index.
- explanation: Detailed conceptual explanation of why the correct answer is true.
- misconception: Highlight the exact misconception or trap that leads students to choose the wrong answers.
- difficulty: "Easy", "Medium", or "Hard".
- subtopic: Specific subtopic name for weak-topic heatmap tracking.
- socraticHints: Array of 3 progressive hints:
  1. Level 1: Guiding conceptual question/nudge.
  2. Level 2: Rule or formula reference clue.
  3. Level 3: Strong elimination hint.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              correctIndex: { type: Type.INTEGER },
              explanation: { type: Type.STRING },
              misconception: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              subtopic: { type: Type.STRING },
              socraticHints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['question', 'options', 'correctIndex', 'explanation', 'misconception', 'difficulty', 'subtopic', 'socraticHints'],
          },
        },
      },
    });

    const questions = JSON.parse(response.text || '[]');
    const enriched = questions.map((q: any, idx: number) => ({
      ...q,
      id: q.id || `gen_q_${Date.now()}_${idx}`,
    }));

    return res.json({ success: true, questions: enriched });
  } catch (error: any) {
    console.error('Gemini generate-quiz error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate quiz' });
  }
});

// 3. Socratic Interactive Tutor Dialogue
app.post('/api/gemini/socratic-tutor', async (req, res) => {
  const { question, options, userDoubt, currentAttempt, conversationHistory = [] } = req.body;
  const ai = getAiClient();

  if (!ai) {
    return res.json({
      success: true,
      reply: `Let's break this down together! Before looking at the final solution, reflect on the core mechanism: what fundamental law or condition must be preserved when analyzing this scenario? Tell me what you think happens first.`,
      guidingQuestion: 'What is the primary constraint mentioned in the problem statement?'
    });
  }

  try {
    const prompt = `You are a world-class Socratic Academic Tutor.
The student is working on this problem:
Question: "${question}"
Options: ${JSON.stringify(options)}
Student's current doubt/thought: "${userDoubt}"
Student's chosen answer so far: ${currentAttempt !== undefined ? currentAttempt : 'None yet'}
Previous chat dialogue: ${JSON.stringify(conversationHistory)}

CRITICAL SOCRATIC RULES:
1. NEVER reveal the direct final answer or option letter directly unless the student has reached it themselves.
2. Ask one laser-focused question or provide a targeted analogy that helps the student deduce the answer.
3. Validate any partial insight they expressed, then highlight where their intuition deviated.
4. Keep the tone encouraging, intellectual, and warm.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an adaptive Socratic Tutor. You guide through targeted questions, not by giving away answers.',
      },
    });

    return res.json({ success: true, reply: response.text });
  } catch (error: any) {
    console.error('Socratic tutor error:', error);
    return res.status(500).json({ error: error.message || 'Socratic tutor failure' });
  }
});

// 4. Generate Spaced-Repetition Flashcards
app.post('/api/gemini/generate-flashcards', async (req, res) => {
  const { topic, content, count = 6 } = req.body;
  const ai = getAiClient();

  if (!ai) {
    return res.json({
      success: true,
      flashcards: [
        {
          id: 'fc1',
          front: `What is the difference between Synchronous and Asynchronous execution in modern runtimes?`,
          back: `Synchronous execution blocks subsequent tasks until completion, following a single thread of execution. Asynchronous execution delegates work (e.g. I/O) to background workers or the event loop, notifying completion via callbacks, promises, or async/await.`,
          mnemonic: 'Sync = Stand-in-line; Async = Buzzer-at-a-pager-restaurant.',
          subtopic: 'Concurrency',
          leitnerBox: 1
        },
        {
          id: 'fc2',
          front: `What is Amdahl\'s Law and what limit does it establish?`,
          back: `A formula calculating the theoretical maximum speedup of a system when using multiple processors. Speedup = 1 / ((1 - P) + (P / N)). It proves that overall speedup is fundamentally limited by the serial (non-parallelizable) fraction (1 - P).`,
          mnemonic: 'Serial fraction is the bottleneck anchor that no amount of cores can break.',
          subtopic: 'Computer Architecture',
          leitnerBox: 1
        }
      ]
    });
  }

  try {
    const prompt = `Generate ${count} spaced-repetition flashcards for "${topic}".
Content context:
"""
${content?.slice(0, 5000) || 'Core principles and definitions'}
"""

For each card:
- front: Crisp question or prompt that triggers active recall.
- back: Concise, precise explanation of the concept or answer.
- mnemonic: A memorable mental model, acronym, or real-world analogy.
- subtopic: Subject sub-area for categorization.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              front: { type: Type.STRING },
              back: { type: Type.STRING },
              mnemonic: { type: Type.STRING },
              subtopic: { type: Type.STRING },
            },
            required: ['front', 'back', 'mnemonic', 'subtopic'],
          },
        },
      },
    });

    const cards = JSON.parse(response.text || '[]');
    const enriched = cards.map((c: any, i: number) => ({
      ...c,
      id: c.id || `fc_${Date.now()}_${i}`,
      leitnerBox: 1,
      nextReviewDate: new Date().toISOString(),
      reviewsCount: 0,
      streak: 0,
    }));

    return res.json({ success: true, flashcards: enriched });
  } catch (error: any) {
    console.error('Flashcard error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate flashcards' });
  }
});

// 5. Generate / Personalize Learning Path & Weak-Topic Diagnostics
app.post('/api/gemini/analyze-learning-path', async (req, res) => {
  const { subject, quizScores = [], completedTopics = [], weakTopics = [] } = req.body;
  const ai = getAiClient();

  if (!ai) {
    return res.json({
      success: true,
      learningPath: {
        targetGoal: `Mastery in ${subject || 'Data Structures & Algorithms'}`,
        overallReadiness: 68,
        recommendedDailyPace: '45 mins/day',
        milestones: [
          {
            id: 'm1',
            title: 'Foundations & Asymptotic Analysis',
            status: 'completed',
            score: 95,
            topics: ['Big-O Notation', 'Logarithmic Scales', 'Recurrence Relations'],
            estimatedHours: 4
          },
          {
            id: 'm2',
            title: 'Linear Structures & Cache Locality',
            status: 'in-progress',
            score: 74,
            topics: ['Contiguous Arrays vs Linked Nodes', 'Circular Queues', 'Stack Call Frames'],
            estimatedHours: 5,
            currentFocus: true
          },
          {
            id: 'm3',
            title: 'Tree Traversals & Balanced Trees',
            status: 'locked',
            score: 42,
            topics: ['AVL Rotations', 'Red-Black Invariants', 'Segment Trees'],
            estimatedHours: 8,
            prerequisiteMilestoneId: 'm2'
          },
          {
            id: 'm4',
            title: 'Graph Algorithms & Dynamic Programming',
            status: 'locked',
            score: 0,
            topics: ['Dijkstra & Topological Sort', 'Memoization vs Tabulation', 'Bitmask DP'],
            estimatedHours: 12,
            prerequisiteMilestoneId: 'm3'
          }
        ],
        weakSpotsAnalysis: [
          {
            topic: 'Tree Balancing & Rotations',
            severity: 'High',
            misconceptionPattern: 'Confusing single left-right double rotations with sequential independent rotations.',
            remedialAction: 'Complete the interactive 3-step visual flashcards on AVL pivot nodes.'
          },
          {
            topic: 'Amortized Analysis',
            severity: 'Medium',
            misconceptionPattern: 'Treating dynamic array reallocation as O(N) per insert rather than O(1) amortized.',
            remedialAction: 'Take 3 targeted Socratic questions on the Accounting / Banker method.'
          }
        ]
      }
    });
  }

  try {
    const prompt = `Analyze a student's learning profile for subject: "${subject}".
Completed Topics: ${JSON.stringify(completedTopics)}
Identified Weak Topics: ${JSON.stringify(weakTopics)}
Quiz History: ${JSON.stringify(quizScores)}

Create a dynamic personalized learning path DAG with:
- targetGoal: string
- overallReadiness: number 0-100
- recommendedDailyPace: string (e.g. "45 mins/day")
- milestones: 4-5 sequential milestones with { id, title, status ("completed"|"in-progress"|"locked"), score (0-100), topics (array of strings), estimatedHours, currentFocus (optional boolean) }
- weakSpotsAnalysis: array of { topic, severity ("High"|"Medium"|"Low"), misconceptionPattern, remedialAction }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, learningPath: parsed });
  } catch (error: any) {
    console.error('Learning path error:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyze learning path' });
  }
});

// 6. Teacher / Instructor Dashboard Insights (Problem statement Bonus Twist: class-wide misconceptions)
app.post('/api/gemini/teacher-insights', async (req, res) => {
  const { classroomName = 'Computer Science 301', aggregateData } = req.body;
  const ai = getAiClient();

  if (!ai) {
    return res.json({
      success: true,
      insights: {
        classroomName,
        totalStudents: 48,
        classAverageScore: 71.4,
        topMisconceptions: [
          {
            subtopic: 'Virtual Memory & Thrashing',
            affectedStudentsPercent: 62,
            misconceptionDescription: 'Students frequently mistake thrashing for CPU pipeline stalls or SSD fragmentation rather than total working-set memory pressure.',
            recommendedLessonIntervention: 'Conduct a 15-minute live memory simulator demonstration showing Page Fault frequency under varying frame allocation.'
          },
          {
            subtopic: 'Recursion Depth vs Space Complexity',
            affectedStudentsPercent: 47,
            misconceptionDescription: 'Belief that tail-call optimization automatically applies in all standard JVM/Python execution runtimes.',
            recommendedLessonIntervention: 'Provide a side-by-side call stack trace diagram illustrating stack frame accumulation.'
          },
          {
            subtopic: 'Lock Granularity in Mutex Synchronization',
            affectedStudentsPercent: 38,
            misconceptionDescription: 'Assuming coarse-grained locks always ensure higher reliability with negligible overhead.',
            recommendedLessonIntervention: 'Benchmark throughput differences in a multithreaded bank-transfer lab exercise.'
          }
        ],
        curriculumPacingRecommendation: 'Allocate 1 additional remedial session on Memory Management before progressing to Distributed File Systems.',
        highRiskStudentCount: 5
      }
    });
  }

  try {
    const prompt = `You are an educational diagnostics engine for teachers and professors.
Analyze the following student performance data for class "${classroomName}":
${JSON.stringify(aggregateData || {})}

Identify class-wide misconceptions and formulate concrete pedagogical interventions:
- classroomName: string
- totalStudents: number
- classAverageScore: number
- topMisconceptions: array of { subtopic: string, affectedStudentsPercent: number, misconceptionDescription: string, recommendedLessonIntervention: string }
- curriculumPacingRecommendation: string
- highRiskStudentCount: number`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, insights: parsed });
  } catch (error: any) {
    console.error('Teacher insights error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate teacher insights' });
  }
});

// Extract readable text from uploaded PDF lecture notes using Gemini
app.post('/api/gemini/extract-text', async (req, res) => {
  const { base64, mimeType = 'application/pdf' } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'PDF data is required.' });
  const ai = getAiClient();
  if (!ai) return res.status(503).json({ error: 'Configure GEMINI_API_KEY to extract PDF notes.' });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { inlineData: { mimeType, data: base64 } },
        { text: 'Extract all readable educational text from this lecture PDF. Preserve headings, formulas, definitions, examples and topic order. Return clean plain text only.' }
      ]
    });
    return res.json({ success: true, text: response.text || '' });
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    return res.status(500).json({ error: error.message || 'PDF extraction failed' });
  }
});

// StudyDost AI Helper chat endpoint
app.post('/api/gemini/chat', async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'A message is required.' });
  const ai = getAiClient();
  if (!ai) return res.json({ success: true, reply: `Let's break this down simply: ${message}\n\nStart by identifying the main idea, learn the key definition, and then work through one small example. Add a GEMINI_API_KEY to enable full Gemini-powered answers.` });
  try {
    const conversation = Array.isArray(history) ? history.slice(-8).map((item: any) => `${item.role === 'user' ? 'Student' : 'Tutor'}: ${String(item.text || '').slice(0, 1500)}`).join('\n') : '';
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are StudyDost AI Helper, a friendly and patient study tutor for college students. Explain in simple language, use short sections and examples, help students understand rather than just giving answers. Keep responses concise unless detail is requested.\nPrevious conversation:\n${conversation}\nStudent: ${message}`
    });
    return res.json({ success: true, reply: response.text || 'Please ask that in another way.' });
  } catch (error: any) {
    console.error('StudyDost chat error:', error);
    return res.status(500).json({ error: error.message || 'Chat response failed' });
  }
});

// Vite middleware in dev or static files in production
const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CogniPath AI Server running on port ${PORT}`);
});
