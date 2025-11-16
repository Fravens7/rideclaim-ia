// groq-images-time-client.js - Cliente para comunicarse con nuestro endpoint específico de imágenes

// Extraer detalles de viajes usando nuestro endpoint especializado en imágenes
async function extractTripsWithGroqImages(ocrText) {
    // NUEVO: Log para verificar si se está llamando a esta función
    console.log("🔍 [GROQ_IMAGES_TIME] Iniciando extracción con IA especializada en imágenes");
    
    // Prompt específico para extraer fechas/horas de recibos de Uber
    const prompt = `
Extract trip details from the following OCR text of an Uber receipt. Focus on extracting accurate dates and times.

The OCR text may contain these common errors:
- "@" should be "9" (e.g., "Nov@" is "Nov9")
- "G" should be "0" (e.g., "10:G0" is "10:00")
- "+" should be ":" (e.g., "10+01" is "10:01")
- Missing colons in times (e.g., "1018" is "10:18")
- Missing spaces in dates (e.g., "Nov10" is "Nov 10")

Return a JSON array where each trip has:
- destination: the destination name
- total_lkr: price in LKR
- tripDate: date of the trip (e.g., "Nov 10")
- tripTime: time of the trip (e.g., "10:18 AM")

Example output:
[
  {
    "destination": "Mireka Tower",
    "total_lkr": "254.35",
    "tripDate": "Nov 10",
    "tripTime": "12:34 PM"
  },
  {
    "destination": "Keells - Lauries",
    "total_lkr": "235.00",
    "tripDate": "Nov 10",
    "tripTime": "10:18 AM"
  }
]

OCR Text:
"""
 ${ocrText}
"""
`;

    try {
        // NUEVO: Log para verificar si se está haciendo la llamada a la API
        console.log("📡 [GROQ_IMAGES_TIME] Enviando solicitud a /api/chat-images-time");
        
        const response = await fetch('/api/chat-images-time', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        const content = data.message;
        console.log("Groq Images Time Response:", content);
        
        // Intentar parsear el JSON de la respuesta
        let tripsData = [];
        try {
            // Buscar JSON en la respuesta
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                tripsData = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error("Error parsing JSON from Groq response:", e);
            throw new Error('Failed to parse trip data from AI response');
        }
        
        // NUEVO: Log para verificar si se extrajeron los datos correctamente
        console.log("✅ [GROQ_IMAGES_TIME] Extracción completada. Viajes encontrados:", tripsData.length);
        
        return tripsData;

    } catch (error) {
        // NUEVO: Log para verificar si hay error
        console.error("❌ [GROQ_IMAGES_TIME] Error en la extracción:", error);
        throw error;
    }
}