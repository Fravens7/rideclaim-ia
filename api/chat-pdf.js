export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let body = {};
try {
  body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
} catch (e) {
  return res.status(400).json({ error: "Invalid JSON body" });
}

const prompt = body?.prompt;
if (!prompt) {
  return res.status(400).json({ error: "Missing 'prompt' field" });
}

    const apiKey = process.env.GROQ_API_KEY_PDFS;
    if (!apiKey) {
      console.error("❌ No GROQ_API_KEY_PDFS found in environment variables");
      return res.status(500).json({ error: 'Missing GROQ API key' });
    }

const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.GROQ_API_KEY_PDFS}`,
  },
  body: JSON.stringify({
    model: "gpt-oss-120b",
    messages: [{ role: "user", content: prompt }]
  }),
});


    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("⚠️ GROQ no devolvió JSON:", text);
      return res.status(500).json({ error: 'Invalid JSON response from GROQ' });
    }

    if (!response.ok) {
      console.error("❌ GROQ API Error:", data);
      return res.status(response.status).json({ error: data.error || 'GROQ API error' });
    }

    return res.status(200).json({
      message: data.choices?.[0]?.message?.content || '(sin respuesta)',
    });

  } catch (err) {
    console.error("💥 Server error:", err);
    return res.status(500).json({ error: err.message });
  }
}
