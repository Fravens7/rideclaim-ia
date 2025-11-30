import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
    try {
        // 1. Configuración rápida
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
        const { image, fileName, mimeType, batchId } = req.body; // Vercel parsea JSON auto a veces, pero por si acaso:
        
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        // 2. Supabase (Rápido)
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');

        // Check duplicado paralelo (No esperamos el upsert del batch para ganar tiempo)
        const checkDuplicate = supabase.from('tripsimg').select('id').eq('batch_id', batchId).eq('image_hash', imageHash);
        const createBatch = supabase.from('analysis_batches').upsert({ id: batchId, status: 'processing' }, { onConflict: 'id' });
        
        await Promise.all([checkDuplicate, createBatch]); // Paralelizamos DB
        const { data: existing } = await checkDuplicate;

        if (existing?.length > 0) return res.status(200).json({ success: true, duplicate: true });

        // 3. OpenAI (Directo, sin reintentos)
        const apiKey = process.env.OPENAI_API_KEY;
        
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${apiKey}` 
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ 
                    role: "user", 
                    content: [
                        { type: "text", text: "Extract receipt data JSON: date(MMM DD), time(HH:MM AM/PM), location, amount(with currency). Array output only." }, 
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}`, detail: "low" } } // DETAIL LOW ahorra tokens y tiempo
                    ] 
                }],
                max_tokens: 300
            })
        });

        if (!response.ok) throw new Error(await response.text());

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || "";
        
        // 4. Limpieza rápida
        const first = content.indexOf('[');
        const last = content.lastIndexOf(']');
        if (first === -1 || last === -1) throw new Error("No JSON found");
        
        const trips = JSON.parse(content.substring(first, last + 1));

        // 5. Guardar (Solo 1 insert, optimizado)
        const tripsArray = Array.isArray(trips) ? trips : [trips];
        
        // Inserción en paralelo
        const inserts = tripsArray.map(trip => {
            if (!trip.amount) return null;
            return supabase.from('tripsimg').insert({
                batch_id: batchId,
                date: trip.date,
                time: trip.time,
                location: trip.location,
                amount: trip.amount,
                type: 'gpt-4o-mini',
                image_hash: imageHash
            });
        });
        
        await Promise.all(inserts);

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
