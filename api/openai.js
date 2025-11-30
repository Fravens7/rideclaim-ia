import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Helper for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        const { image, fileName, mimeType, batchId } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        // 1. Check Duplicates & Batch Setup
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');

        await supabase.from('analysis_batches').upsert({ id: batchId, status: 'processing' }, { onConflict: 'id' });
        
        const { data: existing } = await supabase.from('tripsimg').select('*').eq('batch_id', batchId).eq('image_hash', imageHash);
        if (existing?.length > 0) return res.status(200).json({ success: true, duplicate: true });

        // 2. OpenAI Logic with Retry
        const apiKey = process.env.OPENAI_API_KEY;
        const promptText = `TASK: Extract Uber receipt data. OUTPUT: RAW JSON ARRAY ONLY. NO MARKDOWN. Fields: date ("MMM DD"), time ("HH:MM AM/PM"), location, amount (with currency). Example: [{"date": "Nov 24", "time": "9:34 PM", "location": "Mireka Tower", "amount": "LKR340.00"}]`;

        let response;
        let attempts = 0;
        
        while (attempts < 3) {
            try {
                response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: [{ type: "text", text: promptText }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } }] }],
                        temperature: 0.1, max_tokens: 500
                    })
                });

                if (response.status === 429) { // Rate Limit
                    await delay(2000); // Wait 2s
                    attempts++;
                    continue;
                }
                if (!response.ok) throw new Error(await response.text());
                break; // Success
            } catch (e) {
                attempts++;
                if (attempts >= 3) throw e;
                await delay(1000);
            }
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || "";
        
        // 3. Clean JSON
        let cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const first = cleanJson.indexOf('[');
        const last = cleanJson.lastIndexOf(']');
        if (first !== -1 && last !== -1) cleanJson = cleanJson.substring(first, last + 1);

        const trips = JSON.parse(cleanJson);

        // 4. Save to DB
        for (const trip of (Array.isArray(trips) ? trips : [trips])) {
            if (trip.amount) {
                await supabase.from('tripsimg').insert({
                    batch_id: batchId,
                    date: trip.date,
                    time: trip.time,
                    location: trip.location,
                    amount: trip.amount,
                    type: 'gpt-4o-mini',
                    image_hash: imageHash
                });
            }
        }

        return res.status(200).json({ success: true, source: "OpenAI" });

    } catch (err) {
        console.error("OpenAI Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
