"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Lazy model init with graceful handling if API key is missing
let model = null;
try {
  if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }
} catch (_) {
  model = null;
}

export async function generateCoverLetter(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  // Sanitize and normalize inputs
  const jobTitle = String(data.jobTitle || "").trim().slice(0, 120);
  const companyName = String(data.companyName || "").trim().slice(0, 120);
  const jobDescription = String(data.jobDescription || "").trim().slice(0, 4000);
  const skills = Array.isArray(user.skills) ? user.skills : (user.skills ? [String(user.skills)] : []);

  const prompt = `
    Write a professional cover letter for a ${jobTitle} position at ${companyName}.
    
    About the candidate:
    - Industry: ${user.industry ?? "N/A"}
    - Years of Experience: ${user.experience ?? "N/A"}
    - Skills: ${skills.join(", ")}
    - Professional Background: ${user.bio ?? ""}
    
    Job Description:
    ${jobDescription}
    
    Requirements:
    1. Use a professional, enthusiastic tone
    2. Highlight relevant skills and experience
    3. Show understanding of the company's needs
    4. Keep it concise (max 400 words)
    5. Use proper business letter formatting in markdown
    6. Include specific examples of achievements
    7. Relate candidate's background to job requirements
    
    Format the letter in markdown.
  `;

  // Build a deterministic fallback letter
  const fallback = `
  Dear Hiring Manager,\n\n
  I am excited to apply for the ${jobTitle} role at ${companyName}. With ${user.experience ?? "relevant"} years of experience and strengths in ${skills.slice(0,5).join(", ")}, I believe I can contribute meaningfully to your team.\n\n
  In my recent work, I have delivered measurable outcomes through collaboration, ownership, and continuous improvement. I am particularly drawn to this opportunity because it aligns with my background in ${user.industry ?? "the industry"} and my interest in driving impact for ${companyName}.\n\n
  Highlights:\n
  - Built solutions that improved efficiency and customer outcomes.\n
  - Communicated clearly with cross-functional partners to deliver on goals.\n
  - Continuously learned new tools and best practices to raise quality.\n\n
  I would welcome the opportunity to discuss how my skills can support ${companyName}. Thank you for your time and consideration.\n\n
  Sincerely,\n
  ${user.name ?? "Candidate"}
  `;

  try {
    let content = fallback;
    if (model) {
      const result = await model.generateContent(prompt);
      content = result.response.text().trim() || fallback;
    }

    const coverLetter = await db.coverLetter.create({
      data: {
        content,
        jobDescription,
        companyName,
        jobTitle,
        status: "completed",
        userId: user.id,
      },
    });

    return coverLetter;
  } catch (error) {
    // As a last resort, still save fallback content to avoid UI failure
    const coverLetter = await db.coverLetter.create({
      data: {
        content: fallback,
        jobDescription,
        companyName,
        jobTitle,
        status: "completed",
        userId: user.id,
      },
    });
    return coverLetter;
  }
}

export async function getCoverLetters() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.coverLetter.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.coverLetter.findUnique({
    where: {
      id,
      userId: user.id,
    },
  });
}

export async function deleteCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.coverLetter.delete({
    where: {
      id,
      userId: user.id,
    },
  });
}
