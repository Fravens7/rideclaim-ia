import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        const { image, fileName, mimeType, batchId } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        // 1. Supabase & Duplicates
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');

        await supabase.from('analysis_batches').upsert({ id: batchId, status: 'processing' }, { onConflict: 'id' });
        
        const { data: existing } = await supabase.from('tripsimg').select('*').eq('batch_id', batchId).eq('image_hash', imageHash);
        if (existing?.length > 0) return res.status(200).json({ success: true, duplicate: true });

        // 2. Hugging Face Logic
        const hfKey = process.env.HUGGINGFACE_API_KEY;
        const promptText = `TASK: Extract Uber receipt data. OUTPUT: RAW JSON ARRAY ONLY. NO EXPLANATIONS. Fields: date ("MMM DD"), time ("HH:MM AM/PM"), location, amount (with currency). Example: [{"date": "Nov 24", "time": "9:34 PM", "location": "Mireka Tower", "amount": "LKR340.00"}]`;

        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hfKey}` },
            body: JSON.stringify({
                model: "Qwen/Qwen2.5-VL-7B-Instruct",
                messages: [{ role: "user", content: [{ type: "text", text: promptText }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } }] }],
                temperature: 0.1, max_tokens: 1000
            })
        });

        if (!response.ok) throw new Error(await response.text());

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || "";
        
        // 3. Clean JSON
        let cleanJson = content.split('###')[0].replace(/```json/g, '').replace(/```/g, '').trim();
        const first = cleanJson.indexOf('[');
        const last = cleanJson.lastIndexOf(']');
        if (first !== -1 && last !== -1) cleanJson = cleanJson.substring(first, last + 1);

        const trips = JSON.parse(cleanJson);

// 4. Save to DB (CON DEDUPLICACIÓN LÓGICA)
        const tripsToSave = Array.isArray(trips) ? trips : [trips];

        for (const trip of tripsToSave) {
            // Solo procesar si tiene datos mínimos
            if (trip.amount && trip.date && trip.time) {
                
                // --- EL PORTERO LÓGICO ---
                // Verificamos si ya existe este viaje exacto en este lote
                const { data: duplicates } = await supabase
                    .from('tripsimg')
                    .select('id')
                    .eq('batch_id', batchId)
                    .eq('date', trip.date)
                    .eq('time', trip.time)
                    .eq('amount', trip.amount); // Mismo precio, fecha y hora = DUPLICADO

                // Si ya existe (longitud > 0), NO lo guardamos. Pasamos al siguiente.
                if (duplicates && duplicates.length > 0) {
                    console.log(`♻️ Logical duplicate skipped: ${trip.date} ${trip.time}`);
                    continue; 
                }
                // -------------------------

                await supabase.from('tripsimg').insert({
                    batch_id: batchId,
                    date: trip.date,
                    time: trip.time,
                    location: trip.location,
                    amount: trip.amount,
                    type: 'gpt-4o-mini', // (O 'qwen-hf' en el otro archivo)
                    image_hash: imageHash
                });
            }
        }

        return res.status(200).json({ success: true, source: "HuggingFace" });

    } catch (err) {
        console.error("HF Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
