// --- qwen.js con Supabase integration y anti-duplicados ---
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  try {
    console.log("🚀 Starting Hugging Face Qwen2.5-VL text extraction");

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
    console.log("📁 File info:", { fileName, mimeType, imageSize: image?.length });

    if (!image) {
      return res.status(400).json({ error: "Missing image data" });
    }

    // Calculate image hash for duplicate detection
    const imageHash = crypto.createHash('sha256').update(image).digest('hex');
    console.log("🔑 Image hash:", imageHash);

    // Check for duplicates in Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Verificar si ya existe este hash
      const { data: existingTrips, error: hashError } = await supabase
        .from('tripsimg')
        .select('*')
        .eq('image_hash', imageHash);

      if (hashError) {
        console.error("❌ Error checking hash:", hashError);
      }

      if (existingTrips && existingTrips.length > 0) {
        console.log(`⚠️ Duplicate image detected - returning ${existingTrips.length} existing trips`);

        // Formatear trips para el frontend
        const formattedTrips = existingTrips.map(t => ({
          date: t.date,
          time: t.time,
          location: t.location,
          amount: t.amount,
          type: t.type
        }));

        return res.status(200).json({
          success: true,
          duplicate: true,
          message: "Duplicate image detected",
          extractedText: JSON.stringify(formattedTrips),
          trips: formattedTrips
        });
      }
    }

    const hfKey = process.env.HUGGINGFACE_API_KEY;
    console.log("🔑 API key check:", hfKey ? "Present" : "Missing");

    if (!hfKey) {
      console.error("❌ No HUGGINGFACE_API_KEY found");
      return res.status(500).json({ error: "Missing Hugging Face API key" });
    }

    const hfUrl = "https://router.huggingface.co/v1/chat/completions";

    console.log("📡 Calling Hugging Face API with Qwen2.5-VL...");

    const response = await fetch(hfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfKey}`,
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-VL-7B-Instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analiza esta imagen de recibos de Uber y extrae TODA la información de cada viaje.

IMPORTANTE - Para el TIPO DE VEHÍCULO:
- Observa el ICONO/MINIATURA del vehículo a la IZQUIERDA de cada viaje
- Si ves una moto/tuktuk de color AMARILLO-VERDE = tipo: "tuktuk" o "auto"
- Si ves un carro/taxi de color BLANCO = tipo: "taxi" o "car"
- IGNORA completamente el botón "Rebook" - ese NO es el tipo de vehículo

Extrae para cada viaje:
- Fecha (date)
- Hora (time)
- Destino/Ubicación (location)
- Monto (amount) con moneda
- Tipo de vehículo (type) basado en el ICONO visual, NO en el texto "Rebook"

Devuelve SOLO un JSON array sin explicaciones:
[{"date": "Nov 24", "time": "9:34 PM", "location": "43b Lauries Rd", "amount": "LKR274.00", "type": "tuktuk"}]`,
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
        max_tokens: 2000,
      }),
    });

    console.log("📡 Hugging Face response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Hugging Face API Error:", errorText);
      return res.status(response.status).json({ error: `Hugging Face API error: ${errorText}` });
    }

    const result = await response.json();
    console.log("📄 Hugging Face raw response:", result);

    const extractedText = result.choices?.[0]?.message?.content || "";
    const cleanedExtractedText = extractedText.split('### Explanation of Extraction:')[0].trim();

    // --- GUARDAR EN SUPABASE ---
    try {
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Limpiar JSON si viene con markdown
        let jsonText = cleanedExtractedText.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/```\n?/g, '');
        }

        // Parsear JSON
        const tripsData = JSON.parse(jsonText);
        const tripsArray = Array.isArray(tripsData) ? tripsData : [tripsData];

        // Guardar cada viaje en Supabase
        for (const trip of tripsArray) {
          const { data, error } = await supabase
            .from('tripsimg')
            .insert({
              date: trip.date || trip.timestamp || null,
              time: trip.time || null,
              location: trip.location || trip.destination || null,
              amount: trip.amount || null,
              type: trip.type || null,
              extra_1: trip.extra_1 || null,
              extra_2: trip.extra_2 || null,
              extra_3: trip.extra_3 || null,
              image_hash: imageHash,
            });

          if (error) {
            console.error("❌ Error guardando en Supabase:", error);
          } else {
            console.log("✅ Viaje guardado en Supabase");
          }
        }

        console.log(`✅ ${tripsArray.length} viajes guardados en Supabase`);
      } else {
        console.log("⚠️ Supabase credentials not found, skipping save");
      }
    } catch (supabaseError) {
      console.error("⚠️ Error procesando Supabase:", supabaseError);
      // No fallar la request si Supabase falla
    }

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