// images-validation-ia.js

// --- ESTADO LOCAL DEL MÓDULO ---
// Este array solo existe dentro de este archivo, manteniéndolo aislado.
const qwenExtractedData = [];

// --- FUNCIÓN AUXILIAR PARA ENVIAR A LA API QWEN ---
// Nota: Las funciones fetch deben estar dentro del módulo que las usa.
// images-validation-ia.js

// --- FUNCIÓN AUXILIAR PARA ENVIAR A LA API QWEN (VERSIÓN SIMPLE) ---
// Esta función envía los datos que tu backend espera.
async function extractWithQwen(base64Image, fileName, mimeType) {
    const response = await fetch('/api/qwen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // --- CUERPO SIMPLE: Enviamos solo lo que el backend espera ---
        body: JSON.stringify({
            image: base64Image,
            fileName: fileName,
            mimeType: mimeType
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
}

// --- FUNCIÓN AUXILIAR PARA ANALIZAR PATRONES ---
// images-validation-ia.js

// images-validation-ia.js

// --- FUNCIÓN AUXILIAR PARA ANALIZAR PATRONES ---
function analyzeEmployeePatterns() {
    console.log("🧠 [IA-MODULE] Starting analysis with accumulated data...");
    console.log("📊 [IA-MODULE] Total data points:", qwenExtractedData.length);

    if (qwenExtractedData.length === 0) return;

    // --- LÓGICA FUTURA: Extraer y clasificar viajes (Home-to-Office vs Office-to-Home) ---
    // Para un análisis preciso, necesitaríamos:
    // 1. El destino de cada viaje (ej. "Mireka Tower" o "43b Lauries Rd").
    // 2. La hora de cada viaje.
    // 3. Clasificar cada viaje como "home_to_office" (mañana) u "office_to_home" (tarde).
    // 4. Calcular el rango horario para cada tipo de viaje por separado.
    // Ejemplo de resultado futuro: "Your typical Home-to-Office schedule is from 8:30 AM to 9:00 AM, and Office-to-Home from 6:15 PM to 6:45 PM."

    // Por ahora, solo extraemos la hora como prueba de concepto.
    const extractedTimes = [];
    qwenExtractedData.forEach(data => {
        const timeMatch = data.extractedText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        if (timeMatch) {
            extractedTimes.push(timeMatch[1]);
        }
    });

    if (extractedTimes.length === 0) {
        console.warn("⚠️ [IA-MODULE] Could not extract any times.");
        return;
    }

    console.log("🕒 [IA-MODULE] Extracted times:", extractedTimes);

    // --- LÓGICA TEMPORAL: Calculamos un rango simple (sin clasificar viajes) ---
    const timesInMinutes = extractedTimes.map(timeStr => {
        const [time, period] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        return hours * 60 + minutes;
    });

    const earliestTime = Math.min(...timesInMinutes);
    const latestTime = Math.max(...timesInMinutes);

    const formatTime = (minutes) => {
        const period = minutes >= 720 ? 'PM' : 'AM';
        let displayHour = Math.floor(minutes / 60);
        if (displayHour > 12) displayHour -= 12;
        if (displayHour === 0) displayHour = 12;
        const displayMinute = minutes % 60;
        return `${displayHour}:${displayMinute.toString().padStart(2, '0')} ${period}`;
    };

    // Mensaje provisional
    const result = `Working on it... Current data shows a range from ${formatTime(earliestTime)} to ${formatTime(latestTime)}.`;
    console.log(`🎯 [IA-MODULE] RESULT: ${result}`);

    // --- PUBLICAR EL RESULTADO DEL ANÁLISIS ---
    document.dispatchEvent(new CustomEvent('patternAnalyzed', { detail: { result } }));
}



// --- FUNCIÓN PRINCIPAL DEL MÓDULO ---
// Esta función será llamada desde script.js
// --- FUNCIÓN PRINCIPAL DEL MÓDULO ---
// Esta función será llamada desde script.js
// images-validation-ia.js

// images-validation-ia.js

export async function processImageWithAI(fileName, ocrText, imageDataURL) {
    console.log(`🤖 [IA-MODULE] Starting AI processing for ${fileName}...`);
    try {
        const base64Image = imageDataURL.split(',')[1];
        const qwenResult = await extractWithQwen(base64Image, fileName, 'image/jpeg');

        // --- PASO 1: El backend nos devuelve un objeto. Tomamos la propiedad 'extractedText', que es un string. ---
        const rawExtractedText = qwenResult.extractedText;

        // --- PASO 2: Limpiamos el string para quitarle el markdown (```json ... ````) ---
        const cleanedText = rawExtractedText.replace(/```json\n|\n```/g, '').trim();
        
        // --- PASO 3: Parseamos el string limpio a un objeto JSON real ---
        let tripsData = [];
        try {
            const parsedData = JSON.parse(cleanedText);
            if (parsedData && parsedData.trips && Array.isArray(parsedData.trips)) {
                tripsData = parsedData.trips;
            }
        } catch (parseError) {
            console.error("❌ [IA-MODULE] Failed to parse cleanedText to JSON:", parseError);
        }

        // --- PASO 4: Guardamos el array de viajes ya parseado ---
        qwenExtractedData.push({
            fileName: fileName,
            trips: tripsData // <-- Guardamos el array de objetos, no el string
        });

        console.log("--- 🤖 QWEN PARSED TRIPS (ARRAY DE OBJETOS) ---");
        console.log(tripsData);
        console.log("-------------------------------------------------");

        console.log(`✅ [IA-MODULE] Qwen extraction completed for ${fileName}`);
        analyzeEmployeePatterns();

    } catch (qwenError) {
        console.error(`❌ [IA-MODULE] Error processing ${fileName}:`, qwenError);
    }
}


// Asegúrate de que fileToBase64 esté en este archivo
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}
