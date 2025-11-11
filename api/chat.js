export default async function handler(req, res) {
  try {
    // Solo permitir POST
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Asegurar que haya cuerpo
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    const prompt = body?.prompt;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing "prompt" field' });
    }

    // Revisar la API key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error("❌ No API key found in environment variables");
      return res.status(500).json({ error: 'Missing DeepSeek API key' });
    }

    // Llamar a DeepSeek
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    // Leer respuesta
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("⚠️ DeepSeek no devolvió JSON:", text);
      return res.status(500).json({ error: 'Invalid JSON response from DeepSeek' });
    }

    // Manejar errores de la API
    if (!response.ok) {
      console.error("❌ DeepSeek Error:", data);
      return res.status(response.status).json({ error: data.error || 'DeepSeek API error' });
    }

    // Respuesta exitosa
    return res.status(200).json({
      message: data.choices?.[0]?.message?.content || '(sin respuesta)',
    });

  } catch (err) {
    console.error("💥 Server error:", err);
    return res.status(500).json({ error: err.message });
  }
}
