// images-validation-ia.js

// --- ESTADO LOCAL DEL MÓDULO ---
// Este array solo existe dentro de este archivo, manteniéndolo aislado.
const qwenExtractedData = [];

// --- FUNCIÓN AUXILIAR PARA ENVIAR A LA API QWEN ---
// Nota: Las funciones fetch deben estar dentro del módulo que las usa.
async function extractWithQwen(base64Image, fileName, mimeType) {
    const response = await fetch('/api/qwen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, fileName, mimeType })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
    }
    return await response.json();
}

// --- FUNCIÓN AUXILIAR PARA ANALIZAR PATRONES ---
function analyzeEmployeePatterns() {
    console.log("🧠 [IA-MODULE] Starting analysis with accumulated data...");
    console.log("📊 [IA-MODULE] Total data points:", qwenExtractedData.length);

    if (qwenExtractedData.length === 0) return;

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

    const result = `Your typical schedule appears to be from ${formatTime(earliestTime)} to ${formatTime(latestTime)}.`;
    console.log(`🎯 [IA-MODULE] RESULT: ${result}`);

    // --- PUBLICAR EL RESULTADO DEL ANÁLISIS ---
    // Disparamos un evento personalizado con el resultado del análisis.
    document.dispatchEvent(new CustomEvent('patternAnalyzed', { detail: { result } }));
}

// --- FUNCIÓN PRINCIPAL DEL MÓDULO ---
// Esta función será llamada desde script.js
export async function processImageWithAI(file, ocrText) {
    console.log(`🤖 [IA-MODULE] Starting AI processing for ${file.name}...`);
    try {
        
        const base64Image = imageDataURL.split(',')[1];
        const qwenResult = await extractWithQwen(base64Image, fileName, 'image/jpeg');

        qwenExtractedData.push({
            fileName: file.name,
            extractedText: qwenResult.extractedText
        });

        console.log(`✅ [IA-MODULE] Qwen extraction completed for ${file.name}`);
        analyzeEmployeePatterns();

    } catch (qwenError) {
        console.error(`❌ [IA-MODULE] Error processing ${file.name}:`, qwenError);
    }
}

