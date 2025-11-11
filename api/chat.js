// api/chat.js (Versión Mejorada para Depuración)

export default async function handler(req, res) {
  // Asegurarnos de que solo aceptamos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    console.error("Error parsing JSON:", e);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  const prompt = body?.prompt;
  if (!prompt) {
    console.error("Missing 'prompt' field in request body:", body);
    return res.status(400).json({ error: 'Missing "prompt" field in request body' });
  }

  // Revisar si la clave de la API está disponible
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("❌ ERROR CRÍTICO: La variable de entorno DEEPSEEK_API_KEY no está configurada en Vercel.");
    // --- MEJORA CLAVE: Devolver el error específico en la respuesta 500 ---
    return res.status(500).json({ 
      error: 'Missing DeepSeek API key in server environment variables.',
      details: 'Por favor, configura la variable DEEPSEEK_API_KEY en los ajustes de tu proyecto de Vercel.'
    });
  }

  console.log("🔑 API Key encontrada. Llamando a DeepSeek...");

  try {
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

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("⚠️ DeepSeek no devolvió JSON válido:", text);
      return res.status(502).json({ 
        error: 'Invalid JSON response from DeepSeek API.',
        details: 'La API de DeepSeek devolvió una respuesta no válida.'
      });
    }

    // Manejar errores de la API de DeepSeek
    if (!response.ok) {
      console.error("❌ Error en la API de DeepSeek:", data);
      return res.status(response.status).json({ 
        error: data.error?.message || 'DeepSeek API error',
        details: 'La API de DeepSeek devolvió un error.'
      });
    }

    // Respuesta exitosa
    console.log("✅ Respuesta de DeepSeek recibida.");
    return res.status(200).json({
      message: data.choices?.[0]?.message?.content || '(sin respuesta)',
    });

  } catch (err) {
    console.error("💥 Error interno del servidor:", err);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      details: err.message 
    });
  }
}
