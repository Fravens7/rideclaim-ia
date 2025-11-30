import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image, fileName, mimeType, batchId } = await req.json()

    // 1. Cliente Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Hash simple
    const imageHash = `${fileName}-${image.length}`; 

    // 3. Crear Batch y Check Duplicados
    await supabase.from('analysis_batches').upsert({ id: batchId, status: 'processing' }, { onConflict: 'id' })

    const { data: existing } = await supabase.from('tripsimg').select('id').eq('batch_id', batchId).eq('image_hash', imageHash)
    if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }

    // 4. Llamada a OpenAI (Sin timeout de Vercel!)
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract receipt data JSON: date(MMM DD), time(HH:MM AM/PM), location, amount(with currency). Array output only.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}`, detail: "low" } }
          ]
        }],
        max_tokens: 500
      })
    })

    const aiData = await openAiRes.json()
    if (aiData.error) throw new Error(aiData.error.message)

    const content = aiData.choices[0].message.content

    // Limpieza JSON
    const first = content.indexOf('[')
    const last = content.lastIndexOf(']')
    if (first === -1) throw new Error("No JSON found")
    const trips = JSON.parse(content.substring(first, last + 1))

    // Guardado
    const tripsArray = Array.isArray(trips) ? trips : [trips]
    const inserts = tripsArray.map(trip => {
        if(!trip.amount) return null;
        return supabase.from('tripsimg').insert({
            batch_id: batchId,
            date: trip.date,
            time: trip.time,
            location: trip.location,
            amount: trip.amount,
            type: 'gpt-4o-mini-edge',
            image_hash: imageHash
        })
    })
    
    await Promise.all(inserts)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})