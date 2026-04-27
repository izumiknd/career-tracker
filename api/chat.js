// api/chat.js
// ストリーミングチャット用エンドポイント
// Vercel Edge Functionsで動作

export const config = { runtime: "edge" };

// レートリミット（簡易版：IPごとに1分間10回まで）
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分
  const maxRequests = 10;
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count <= maxRequests;
}

export default async function handler(req) {
  // CORSヘッダー
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers });
  }

  // レートリミットチェック
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: "リクエストが多すぎます。しばらくしてから再度お試しください。" }),
      { status: 429, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messagesが必要です" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "APIキーが設定されていません" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Groq APIにストリーミングリクエスト
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.6,
        max_tokens: 400,
        stream: true,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: err?.error?.message || "Groq APIエラー" }),
        { status: groqRes.status, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // ストリームをそのままクライアントに転送
    return new Response(groqRes.body, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "サーバーエラーが発生しました" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
}
