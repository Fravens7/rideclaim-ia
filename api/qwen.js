import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        // 1. Obtener batchId del cuerpo de la petición
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

        console.log(`🚀 Processing file for Batch: ${batchId}`);

        // 2. Check de Duplicados (Dentro del mismo lote)
        const imageHash = crypto.createHash('sha256').update(image).digest('hex');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data: existing } = await supabase
                .from('tripsimg')
                .select('*')
                .eq('batch_id', batchId) // Solo buscamos duplicados en ESTE empleado
                .eq('image_hash', imageHash);

            if (existing && existing.length > 0) {
                console.log("⚠️ Duplicate in batch ignored");
                return res.status(200).json({ success: true, duplicate: true, message: "Duplicate" });
            }
        }

        // 3. Prompt Optimizado (Sin detección de vehículos para ahorrar tokens/tiempo)
        const hfKey = process.env.HUGGINGFACE_API_KEY;
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
                            {
                                type: "text",
                                text: `Extrae datos de este recibo de Uber.
                                
                                Requerido:
                                - Date (Ej: "Nov 24")
                                - Time (Ej: "9:34 PM")
                                - Location/Destination (Dirección de destino)
                                - Amount (Monto total con moneda LKR)
                                
                                Formato de salida JSON Array puro:
                                [{"date": "Nov 24", "time": "9:34 PM", "location": "Mireka Tower", "amount": "LKR340.00"}]`
                            },
                            {
                                type: "image_url",
                                image_url: { url: `data:${mimeType};base64,${image}` }
                            }
                        ]
                    }
                ],
                temperature: 0.1,
                max_tokens: 500
            })
        });

        const result = await response.json();
        const extractedText = result.choices?.[0]?.message?.content || "";
        
        // Limpieza de JSON (Markdown removal)
        let cleanJson = extractedText.replace(/```json/g, '').replace(/```/g, '').trim();
        // A veces el modelo habla antes del JSON, buscamos el primer [ y último ]
        const firstBracket = cleanJson.indexOf('[');
        const lastBracket = cleanJson.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
        }

        // 4. Guardar en Supabase con batch_id
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const tripsArray = JSON.parse(cleanJson);
            
            // Asegurar que sea array
            const tripsToSave = Array.isArray(tripsArray) ? tripsArray : [tripsArray];

            for (const trip of tripsToSave) {
                await supabase.from('tripsimg').insert({
                    batch_id: batchId, // <--- IMPORTANTE
                    date: trip.date,
                    time: trip.time,
                    location: trip.location,
                    amount: trip.amount,
                    type: 'standard', // Hardcodeamos standard para no complicar
                    image_hash: imageHash
                });
            }
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
