"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Lazy + safe model initialization
let model = null;
try {
  if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }
} catch (_) {
  model = null;
}

export async function generateQuiz() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: {
      industry: true,
      skills: true,
    },
  });

  if (!user) throw new Error("User not found");

  const prompt = `
    Generate 10 technical interview questions for a ${
      user.industry
    } professional${
    user.skills?.length ? ` with expertise in ${user.skills.join(", ")}` : ""
  }.
    
    Each question should be multiple choice with 4 options.
    
    Return the response in this JSON format only, no additional text:
    {
      "questions": [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "correctAnswer": "string",
          "explanation": "string"
        }
      ]
    }
  `;

  // Fallback questions if AI model is unavailable or fails
  const fallbackQuestions = [
    {
      question: "Which HTTP method is idempotent?",
      options: ["POST", "PUT", "PATCH", "CREATE"],
      correctAnswer: "PUT",
      explanation: "PUT is idempotent; multiple identical requests have the same effect."
    },
    {
      question: "What does ACID stand for in databases?",
      options: [
        "Atomicity, Consistency, Isolation, Durability",
        "Availability, Consistency, Isolation, Durability",
        "Atomicity, Concurrency, Integrity, Durability",
        "Availability, Concurrency, Integrity, Durability"
      ],
      correctAnswer: "Atomicity, Consistency, Isolation, Durability",
      explanation: "ACID describes key transaction properties in RDBMS."
    },
    {
      question: "Which is NOT a JavaScript primitive?",
      options: ["string", "number", "object", "boolean"],
      correctAnswer: "object",
      explanation: "Objects are reference types, not primitives."
    },
    {
      question: "In Git, which command creates a new branch and switches to it?",
      options: ["git checkout -b", "git branch -m", "git switch -c", "Both 1 and 3"],
      correctAnswer: "Both 1 and 3",
      explanation: "Both 'git checkout -b' and 'git switch -c' create and switch."
    },
    {
      question: "Which Big-O represents binary search on a sorted array?",
      options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
      correctAnswer: "O(log n)",
      explanation: "Binary search halves the search space each step."
    },
    {
      question: "What is the purpose of a load balancer?",
      options: [
        "Distribute traffic across servers",
        "Store session data",
        "Encrypt database records",
        "Compile application code"
      ],
      correctAnswer: "Distribute traffic across servers",
      explanation: "Balances requests for availability and performance."
    },
    {
      question: "What does 'idempotent' mean in REST APIs?",
      options: [
        "Multiple identical requests result in the same state",
        "The server never returns errors",
        "The request has no side effects",
        "The response is always cached"
      ],
      correctAnswer: "Multiple identical requests result in the same state",
      explanation: "Idempotency allows safe retries."
    },
    {
      question: "Which SQL clause filters rows?",
      options: ["ORDER BY", "GROUP BY", "WHERE", "JOIN"],
      correctAnswer: "WHERE",
      explanation: "WHERE filters rows before grouping."
    },
    {
      question: "Which AWS service is serverless compute?",
      options: ["EC2", "Lambda", "ECS", "EBS"],
      correctAnswer: "Lambda",
      explanation: "Lambda runs code without managing servers."
    },
    {
      question: "Which data structure is best for LRU cache?",
      options: ["Stack", "Queue", "HashMap + Doubly Linked List", "Binary Tree"],
      correctAnswer: "HashMap + Doubly Linked List",
      explanation: "Enables O(1) get/put and eviction."
    }
  ];

  try {
    if (!model) return fallbackQuestions;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
    const quiz = JSON.parse(cleanedText);
    return Array.isArray(quiz.questions) && quiz.questions.length > 0
      ? quiz.questions
      : fallbackQuestions;
  } catch (error) {
    console.error("Error generating quiz:", error);
    return fallbackQuestions;
  }
}

export async function saveQuizResult(questions, answers, score) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  const questionResults = questions.map((q, index) => ({
    question: q.question,
    answer: q.correctAnswer,
    userAnswer: answers[index],
    isCorrect: q.correctAnswer === answers[index],
    explanation: q.explanation,
  }));

  // Get wrong answers
  const wrongAnswers = questionResults.filter((q) => !q.isCorrect);

  // Only generate improvement tips if there are wrong answers
  let improvementTip = null;
  if (wrongAnswers.length > 0 && model) {
    const wrongQuestionsText = wrongAnswers
      .map(
        (q) =>
          `Question: "${q.question}"\nCorrect Answer: "${q.answer}"\nUser Answer: "${q.userAnswer}"`
      )
      .join("\n\n");

    const improvementPrompt = `
      The user got the following ${user.industry} technical interview questions wrong:

      ${wrongQuestionsText}

      Based on these mistakes, provide a concise, specific improvement tip.
      Focus on the knowledge gaps revealed by these wrong answers.
      Keep the response under 2 sentences and make it encouraging.
      Don't explicitly mention the mistakes, instead focus on what to learn/practice.
    `;

    try {
      const tipResult = await model.generateContent(improvementPrompt);
      improvementTip = tipResult.response.text().trim();
    } catch (error) {
      // Continue without improvement tip if generation fails
    }
  }

  try {
    const assessment = await db.assessment.create({
      data: {
        userId: user.id,
        quizScore: score,
        questions: questionResults,
        category: "Technical",
        improvementTip,
      },
    });

    return assessment;
  } catch (error) {
    console.error("Error saving quiz result:", error);
    throw new Error("Failed to save quiz result");
  }
}

export async function getAssessments() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  try {
    const assessments = await db.assessment.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return assessments;
  } catch (error) {
    console.error("Error fetching assessments:", error);
    throw new Error("Failed to fetch assessments");
  }
}
