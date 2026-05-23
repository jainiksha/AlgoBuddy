import OpenAI from "openai";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 15; // 15 requests per minute for active chatting
const rateLimitBuckets = new Map();

function getClientIp(headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function allowRequest(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  bucket.count += 1;
  return true;
}

export async function POST(req) {
  try {
    // 1. Rate Limiting Check
    const ip = getClientIp(req.headers);
    if (!allowRequest(ip)) {
      return Response.json(
        { error: "Too many messages. Please wait a minute and try again." },
        { status: 429 }
      );
    }

    // 2. Validate API Key
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OpenAI API Key is missing. Please add OPENAI_API_KEY to your .env.local file." },
        { status: 500 }
      );
    }

    // 3. Parse and Validate Request Body
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const { messages } = body || {};
    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: "Invalid or missing 'messages' array." }, { status: 400 });
    }

    // 4. Initialize OpenAI Client
    const apiKey = process.env.OPENAI_API_KEY;
    const isOpenRouter = apiKey.startsWith("sk-or-");

    const openai = new OpenAI({
      apiKey: apiKey,
      ...(isOpenRouter
        ? {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
              "HTTP-Referer": "https://algobuddy.in",
              "X-Title": "AlgoBuddy",
            },
          }
        : {}),
    });

    const modelName = isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini";

    // 5. Call Chat Completions API
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: `You are the AlgoBuddy AI Assistant, an interactive helper for students and developers learning Data Structures and Algorithms (DSA). Your goal is to explain concepts in simple, easy-to-understand words, avoid jargon where possible, and provide clear step-by-step guidance.

Capabilities & Guidelines:
1. Explain concepts step-by-step (e.g., how a queue works, how quicksort partitions elements).
2. Answer user doubts in a friendly, supportive, and beginner-friendly tone.
3. Explain code line-by-line. Highlight what each variable represents and what each loop/conditional accomplishes.
4. Help beginners understand time and space complexity (Big O notation) using intuitive analogies.
5. Give simple examples and quiz help. Do not give direct answers immediately if the user is asking a quiz question; instead, guide them to the answer by explaining the underlying concept and asking leading questions.
6. Format your responses using clean Markdown. Use headings, bullet points, bold text, and code blocks with language specifiers for syntax highlighting.
7. Keep responses concise and structured. Do not overwhelm the user with walls of text.
8. If asked about something unrelated to programming, computer science, or DSA, politely redirect the conversation back to algorithms and data structures.`
        },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const reply = response.choices[0]?.message;
    if (!reply) {
      throw new Error("No response received from OpenAI API.");
    }

    return Response.json({ message: reply });
  } catch (error) {
    console.error("Chatbot API error:", error);
    return Response.json(
      { error: error.message || "An error occurred while processing your request." },
      { status: 500 }
    );
  }
}
