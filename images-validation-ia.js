// images-validation-ia.js

// --- FUNCIÓN AUXILIAR PARA ENVIAR A LA API QWEN ---
// (Sin cambios)
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

// --- FUNCIÓN PRINCIPAL DEL MÓDULO ---
export async function processImageWithAI(fileName, ocrText, imageDataURL) {
    console.log(`🤖 [IA-MODULE] Processing ${fileName}...`);
    try {
        const base64Image = imageDataURL.split(',')[1];
        const qwenResult = await extractWithQwen(base64Image, fileName, 'image/jpeg');

        // --- PASO 1: OBTENER EL TEXTO CRUDO DE QWEN ---
        const rawText = qwenResult.extractedText;

        // --- PASO 2: LIMPIAR EL TEXTO PARA QUE SEA JSON VÁLIDO ---
        let cleanedText = rawText.trim();
        if (cleanedText.startsWith('```json')) cleanedText = cleanedText.substring(7);
        if (cleanedText.endsWith('```')) cleanedText = cleanedText.substring(0, cleanedText.length - 3);
        cleanedText = cleanedText.trim();

        // --- PASO 3: CONVERTIR EL TEXTO LIMPIO A UN OBJETO JAVASCRIPT ---
        const data = JSON.parse(cleanedText);

        // --- PASO 4: EXTRAER LAS HORAS DE LOS VIAJES A LA OFICINA ---
        // Aquí está la lógica que pides: usar la columna "time" del JSON.
        const officeTrips = data.trips.filter(trip => 
            trip.destination && trip.destination.toLowerCase().includes("mireka tower")
        );

        const arrivalTimesInMinutes = officeTrips.map(trip => {
            const timeInMinutes = timeToMinutes(trip.time); // Usamos la columna "time"
            return timeInMinutes !== null ? timeInMinutes + 15 : null; // Sumamos 15 min de viaje
        }).filter(time => time !== null);

        if (arrivalTimesInMinutes.length === 0) {
            console.log("No se encontraron viajes a la oficina con hora válida.");
            return;
        }

        // --- PASO 5: CALCULAR E IMPRIMIR EL HORARIO ---
        const latestArrival = Math.max(...arrivalTimesInMinutes);
        const startHour = Math.floor(latestArrival / 60) + (latestArrival % 60 !== 0 ? 1 : 0);
        const startTimeInMinutes = startHour * 60;
        const endTimeInMinutes = startTimeInMinutes + (9 * 60);

        console.clear();
        console.log("Start time: " + minutesToTime(startTimeInMinutes));
        console.log("End time: " + minutesToTime(endTimeInMinutes));

    } catch (error) {
        console.error(`❌ [IA-MODULE] Error processing ${fileName}:`, error);
    }
}

// --- FUNCIONES AUXILIARES DE TIEMPO ---
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    let [, hours, minutes, period] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);
    period = period.toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    if (minutes >= 24 * 60) minutes -= 24 * 60;
    const period = minutes >= 12 * 60 ? 'PM' : 'AM';
    let displayHour = Math.floor(minutes / 60);
    if (displayHour > 12) displayHour -= 12;
    if (displayHour === 0) displayHour = 12;
    const displayMinute = minutes % 60;
    return `${displayHour}:${displayMinute.toString().padStart(2, '0')} ${period}`;
}