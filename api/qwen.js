import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
        
        // Validación vital para tu sistema de lotes
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        console.log(`🚀 [OpenAI GPT-4o-mini] Processing: ${fileName}`);

        // 2. Check de Duplicados (Supabase)
        // Calculamos el hash para no cobrar 2 veces por la misma imagen
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            // Aseguramos que el lote existe
            await supabase.from('analysis_batches').upsert({ id: batchId, status: 'processing' }, { onConflict: 'id' });
            
            // Buscamos si esta imagen ya se procesó en este lote
            const { data: existing } = await supabase
                .from('tripsimg')
                .select('*')
                .eq('batch_id', batchId)
                .eq('image_hash', imageHash);

            if (existing && existing.length > 0) {
                console.log("⚠️ Duplicate image detected in batch, skipping API cost.");
                return res.status(200).json({ success: true, duplicate: true });
            }
        }

        // 3. CONEXIÓN A OPENAI (El nuevo motor)
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.error("❌ Missing OPENAI_API_KEY");
            return res.status(500).json({ error: "Server configuration error: Missing API Key" });
        }

        // Prompt Optimizado para Recibos
        const promptText = `
        TASK: Extract Uber receipt data from the image.
        OUTPUT FORMAT: RAW JSON ARRAY ONLY. NO MARKDOWN blocks (like \`\`\`json). NO EXPLANATIONS.
        
        REQUIRED FIELDS:
        - date (Format: "MMM DD", e.g., "Nov 24")
        - time (Format: "HH:MM AM/PM")
        - location (Destination address only)
        - amount (Total amount with currency, e.g., "LKR340.00")

        EXAMPLE OUTPUT:
        [{"date": "Nov 24", "time": "9:34 PM", "location": "Mireka Tower", "amount": "LKR340.00"}]
        `;

        const startTime = Date.now();

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", // <--- Rápido, Barato y Preciso
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: promptText },
                            {
                                type: "image_url",
                                image_url: { url: `data:${mimeType || "image/jpeg"};base64,${image}` }
                            }
                        ]
                    }
                ],
                temperature: 0.1, // Baja temperatura para ser preciso, no creativo
                max_tokens: 800
            })
        });

        const duration = (Date.now() - startTime) / 1000;
        console.log(`⏱️ OpenAI Speed: ${duration}s`);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API Error: ${errText}`);
        }

        const result = await response.json();
        const extractedText = result.choices?.[0]?.message?.content || "";
        
        // 4. Limpieza de JSON (Por si OpenAI pone bloques de código)
        let cleanJson = extractedText
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
            
        // Buscar el array [ ... ] por seguridad
        const firstBracket = cleanJson.indexOf('[');
        const lastBracket = cleanJson.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
        }

        let tripsArray = [];
        try {
            tripsArray = JSON.parse(cleanJson);
        } catch (e) {
            console.error("JSON Parse Error:", cleanJson);
            return res.status(200).json({ success: false, error: "Invalid JSON from AI" });
        }

        // 5. Guardar en Supabase
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const tripsToSave = Array.isArray(tripsArray) ? tripsArray : [tripsArray];

            for (const trip of tripsToSave) {
                // Solo guardamos si tiene datos mínimos
                if (trip.amount || trip.time) {
                    await supabase.from('tripsimg').insert({
                        batch_id: batchId, // Vinculamos al lote actual
                        date: trip.date,
                        time: trip.time,
                        location: trip.location,
                        amount: trip.amount,
                        type: 'standard', // Ignoramos tipo de vehículo por ahora
                        image_hash: imageHash
                    });
                }
            }
        }

        return res.status(200).json({ success: true, speed: duration });

    } catch (err) {
        console.error("💥 Server Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
