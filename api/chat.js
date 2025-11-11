export default async function handler(req, res) {
  try {
    const { prompt } = await req.json(); // o req.body si usas Node 16

    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",   // o el modelo que prefieras
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
