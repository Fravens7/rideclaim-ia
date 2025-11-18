// --- qwen.js corregido para usar la nueva URL de Hugging Face ---

export default async function handler(req, res) {
  try {
    console.log("🚀 Starting Hugging Face Qwen2-VL text extraction");

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const { image, fileName, mimeType } = body;
    console.log("📁 File info:", {
      fileName,
      mimeType,
      imageSize: image?.length,
    });

    if (!image) {
      return res.status(400).json({ error: "Missing image data" });
    }

    const hfKey = process.env.HUGGINGFACE_API_KEY;
    console.log("🔑 API key check:", hfKey ? "Present" : "Missing");

    if (!hfKey) {
      console.error("❌ No HUGGINGFACE_API_KEY found");
      return res.status(500).json({ error: "Missing Hugging Face API key" });
    }

    // --- ¡CAMBIO CLAVE! Usamos la nueva URL actualizada de Hugging Face ---
    const hfUrl = "https://router.huggingface.co/hf-inference";

    console.log("📡 Calling Hugging Face API with Qwen2-VL...");

    const response = await fetch(hfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfKey}`,
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2-VL-7B-Instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract ALL trip information from this receipt image. This appears to be a ride-sharing or transport receipt with multiple trips.

Please extract:
1. Destination/Location names for ALL trips visible
2. Date for each trip 
3. Time for each trip
4. Amount for each trip
5. Currency
6. Status of each trip
7. Type of service (ride, tuktuk, delivery, etc.)

Return ONLY the JSON object. Do not include any explanations, introductory text, or concluding remarks outside of the JSON structure.
{
  "trips": [
    {
      "destination": "Location name",
      "date": "Nov 7", 
      "time": "4:10 PM",
      "amount": "450.00",
      "currency": "LKR",
      "status": "Completed",
      "type": "ride"
    }
  ]
}

Extract ALL visible trips, not just the first one. Be thorough and capture every journey shown in the receipt.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/jpeg"};base64,${image}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    console.log("📡 Hugging Face response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Hugging Face API Error:", errorText);
      return res
        .status(response.status)
        .json({ error: `Hugging Face API error: ${errorText}` });
    }

    const result = await response.json();
    console.log("📄 Hugging Face raw response:", result);

    const extractedText = result.choices?.[0]?.message?.content || "";
    const cleanedExtractedText = extractedText.split('### Explanation of Extraction:')[0].trim();

    return res.status(200).json({
      extractedText: cleanedExtractedText,
      fileName: fileName,
      success: true,
    });
  } catch (err) {
    console.error("💥 Server error:", err);
    console.error("💥 Error stack:", err.stack);
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
}