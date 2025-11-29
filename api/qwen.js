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

        if (!batchId) {
            return res.status(400).json({ error: "Missing batchId" });
        }

        console.log(`🚀 Processing file: ${fileName} for Batch: ${batchId}`);

        // 2. Check de Duplicados (Dentro del mismo lote)
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data: existing } = await supabase
                .from('tripsimg')
                .select('*')
                .eq('batch_id', batchId)
                .eq('image_hash', imageHash);

            if (existing && existing.length > 0) {
                console.log("⚠️ Duplicate detected within batch, skipping AI.");
                return res.status(200).json({ success: true, duplicate: true, message: "Duplicate" });
            }
        }

        // 3. Prompt Super Estricto
        const hfKey = process.env.HUGGINGFACE_API_KEY;
        
        // Instrucción directa y clara
        const promptText = `
        TASK: Extract Uber receipt data.
        OUTPUT FORMAT: RAW JSON ARRAY ONLY. NO EXPLANATIONS. NO MARKDOWN.
        
        Required Fields:
        - date (Format: "MMM DD", e.g., "Nov 24")
        - time (Format: "HH:MM AM/PM")
        - location (Destination address)
        - amount (Total with currency, e.g., "LKR340.00")

        Example Output:
        [{"date": "Nov 24", "time": "9:34 PM", "location": "Mireka Tower", "amount": "LKR340.00"}]
        `;

        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
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
                            { type: "text", text: promptText },
                            {
                                type: "image_url",
                                image_url: { url: `data:${mimeType};base64,${image}` }
                            }
                        ]
                    }
                ],
                temperature: 0.1, // Baja temperatura para ser más preciso
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Hugging Face Error: ${errText}`);
        }

        const result = await response.json();
        const extractedText = result.choices?.[0]?.message?.content || "";
        
        console.log("🤖 Raw AI Response:", extractedText.substring(0, 100) + "..."); // Log para depuración

        // 4. Limpieza Robusta del JSON (La parte que fallaba antes)
        let cleanJson = extractedText;
        
        // Buscar el primer corchete '[' y el último ']'
        const firstBracket = cleanJson.indexOf('[');
        const lastBracket = cleanJson.lastIndexOf(']');

        if (firstBracket !== -1 && lastBracket !== -1) {
            // Si encontramos corchetes, nos quedamos SOLO con lo que hay dentro (y los corchetes)
            cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
        } else {
            // Si no hay corchetes, la IA falló completamente
            console.error("❌ No valid JSON array found in response");
            // No rompemos el servidor, devolvemos success false pero manejado
            return res.status(200).json({ success: false, error: "AI could not extract valid data" });
        }

        // 5. Parseo seguro
        let tripsArray = [];
        try {
            tripsArray = JSON.parse(cleanJson);
        } catch (parseError) {
            console.error("❌ JSON Parse Error:", parseError.message);
            console.error("❌ Offending Text:", cleanJson);
            return res.status(200).json({ success: false, error: "Invalid JSON format from AI" });
        }

// 6. Guardar en Supabase
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            // --- NUEVO: ASEGURAR QUE EL BATCH EXISTE ---
            // Intentamos crear el batch primero. Si ya existe, no pasa nada.
            const { error: batchError } = await supabase
                .from('analysis_batches')
                .upsert({ id: batchId, status: 'processing' }, { onConflict: 'id' });
            
            if (batchError) console.error("⚠️ Error creating batch:", batchError);
            // -------------------------------------------

            // Asegurar que es array
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

        return res.status(200).json({ success: true, count: tripsArray.length });

    } catch (err) {
        console.error("💥 Server Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
