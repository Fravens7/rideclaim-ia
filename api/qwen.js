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
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        console.log(`🚀 [Hugging Face Qwen] Processing: ${fileName}`);

        // 2. Check de Duplicados (Supabase)
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            // Aseguramos que el lote existe
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

        // 3. CONEXIÓN A HUGGING FACE
        const hfKey = process.env.HUGGINGFACE_API_KEY;
        if (!hfKey) return res.status(500).json({ error: "Missing Hugging Face API key" });

        const promptText = `TASK: Extract Uber receipt data. OUTPUT: RAW JSON ARRAY ONLY. NO EXPLANATIONS. Fields: date ("MMM DD"), time ("HH:MM AM/PM"), location, amount (with currency). Example: [{"date": "Nov 24", "time": "9:34 PM", "location": "Mireka Tower", "amount": "LKR340.00"}]`;

        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${hfKey}`
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
                                image_url: { url: `data:${mimeType || "image/jpeg"};base64,${image}` }
                            }
                        ]
                    }
                ],
                temperature: 0.1,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HF API Error: ${errText}`);
        }

        const result = await response.json();
        const extractedText = result.choices?.[0]?.message?.content || "";
        
        // 4. Limpieza de JSON
        let cleanJson = extractedText.split('###')[0].replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBracket = cleanJson.indexOf('[');
        const lastBracket = cleanJson.lastIndexOf(']');

        if (firstBracket !== -1 && lastBracket !== -1) {
            cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
        }

        let tripsArray = [];
        try {
            tripsArray = JSON.parse(cleanJson);
        } catch (e) {
            return res.status(200).json({ success: false, error: "Invalid JSON from AI" });
        }

        // 5. Guardar en Supabase con Deduplicación Lógica
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const tripsToSave = Array.isArray(tripsArray) ? tripsArray : [tripsArray];

            for (const trip of tripsToSave) {
                if (trip.amount && trip.date) {
                    // Deduplicación Lógica
                    const { data: logicalDupes } = await supabase
                        .from('tripsimg')
                        .select('id')
                        .eq('batch_id', batchId)
                        .eq('date', trip.date)
                        .eq('time', trip.time)
                        .eq('amount', trip.amount);

                    if (!logicalDupes || logicalDupes.length === 0) {
                        await supabase.from('tripsimg').insert({
                            batch_id: batchId,
                            date: trip.date,
                            time: trip.time,
                            location: trip.location,
                            amount: trip.amount,
                            type: 'qwen-hf',
                            image_hash: imageHash
                        });
                    }
                }
            }
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("💥 Server Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
