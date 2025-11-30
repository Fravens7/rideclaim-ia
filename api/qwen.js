import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Función para esperar (Sleep)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        // 1. Parsear Body
        let body = {};
        try {
            body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        } catch (e) {
            return res.status(400).json({ error: "Invalid JSON body" });
        }

        const { image, fileName, mimeType, batchId } = body;
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        console.log(`🚀 Processing: ${fileName}`);

        // 2. Check de Duplicados (Supabase)
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            await supabase.from('analysis_batches').upsert({ id: batchId, status: 'processing' }, { onConflict: 'id' });
            
            const { data: existing } = await supabase
                .from('tripsimg')
                .select('*')
                .eq('batch_id', batchId)
                .eq('image_hash', imageHash);

            if (existing && existing.length > 0) {
                console.log("⚠️ Duplicate detected, skipping API.");
                return res.status(200).json({ success: true, duplicate: true });
            }
        }

        // 3. CONEXIÓN A OPENAI CON REINTENTO AUTOMÁTICO
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

        const promptText = `
        TASK: Extract Uber receipt data.
        OUTPUT: JSON ARRAY ONLY. NO MARKDOWN.
        Fields: date ("MMM DD"), time ("HH:MM AM/PM"), location, amount (with currency).
        Example: [{"date": "Nov 24", "time": "9:34 PM", "location": "Mireka Tower", "amount": "LKR340.00"}]
        `;

        // --- LÓGICA DE REINTENTO (RETRY LOGIC) ---
        let response;
        let attempts = 0;
        const maxAttempts = 3; // Intentaremos hasta 3 veces

        while (attempts < maxAttempts) {
            try {
                response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: promptText },
                                    { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${image}` } }
                                ]
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 800
                    })
                });

                // Si es error 429 (Too Many Requests), esperamos y reintentamos
                if (response.status === 429) {
                    console.log(`⏳ Rate Limit hit for ${fileName}. Waiting 2s... (Attempt ${attempts + 1}/${maxAttempts})`);
                    await delay(2000); // Esperar 2 segundos
                    attempts++;
                    continue; // Volver al inicio del loop
                }

                // Si es otro error, lanzamos excepción
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`OpenAI API Error: ${errText}`);
                }

                // Si todo salió bien, rompemos el loop
                break; 

            } catch (error) {
                // Si fue un error de red, también contamos intento
                attempts++;
                if (attempts >= maxAttempts) throw error;
                await delay(1000);
            }
        }
        // ----------------------------------------

        const result = await response.json();
        const extractedText = result.choices?.[0]?.message?.content || "";
        
        // 4. Limpieza de JSON
        let cleanJson = extractedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBracket = cleanJson.indexOf('[');
        const lastBracket = cleanJson.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
        }

        let tripsArray = [];
        try {
            tripsArray = JSON.parse(cleanJson);
        } catch (e) {
            return res.status(200).json({ success: false, error: "Invalid JSON" });
        }

        // 5. Guardar en Supabase
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const tripsToSave = Array.isArray(tripsArray) ? tripsArray : [tripsArray];

            for (const trip of tripsToSave) {
                if (trip.amount || trip.time) {
                    await supabase.from('tripsimg').insert({
                        batch_id: batchId,
                        date: trip.date,
                        time: trip.time,
                        location: trip.location,
                        amount: trip.amount,
                        type: 'standard',
                        image_hash: imageHash
                    });
                }
            }
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("💥 Server Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
