// images-validation-ia.js

// --- ESTADO LOCAL DEL MÓDULO ---
// Reutilizamos este array, pero ahora guardaremos objetos de viaje en lugar de texto crudo.
const qwenExtractedData = [];

// --- FUNCIÓN AUXILIAR PARA ENVIAR A LA API QWEN ---
// (Sin cambios)
async function extractWithQwen(base64Image, fileName, mimeType) {
    const response = await fetch('/api/qwen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

// --- FUNCIÓN PRINCIPAL DEL MÓDULO ---
// Modificada para parsear el JSON y llamar al análisis.
export async function processImageWithAI(fileName, ocrText, imageDataURL) {
    console.log(`🤖 [IA-MODULE] Starting AI processing for ${fileName}...`);
    try {
        const base64Image = imageDataURL.split(',')[1];
        const qwenResult = await extractWithQwen(base64Image, fileName, 'image/jpeg');

        // --- NUEVO: INTENTAR PARSEAR LA RESPUESTA COMO JSON ---
        let parsedTrips;
        try {
            // Qwen debería devolver un JSON válido. Lo parseamos.
            parsedTrips = JSON.parse(qwenResult.extractedText);
        } catch (e) {
            console.error(`❌ [IA-MODULE] Failed to parse JSON from AI for ${fileName}. Raw text:`, qwenResult.extractedText);
            // Si no es JSON, no podemos procesarlo. Salimos de la función.
            return;
        }

        // --- NUEVO: GUARDAR LOS DATOS ESTRUCTURADOS ---
        if (parsedTrips && Array.isArray(parsedTrips.trips)) {
            parsedTrips.trips.forEach(trip => {
                qwenExtractedData.push({
                    destination: trip.destination,
                    time: trip.time,
                    date: trip.date,
                    sourceFile: fileName // Guardamos el archivo de origen para referencia
                });
            });
            console.log(`✅ [IA-MODULE] Extracted ${parsedTrips.trips.length} trips from ${fileName}. Total trips in memory: ${qwenExtractedData.length}`);
        } else {
            console.warn(`⚠️ [IA-MODULE] No 'trips' array found in AI response for ${fileName}.`);
        }

        // --- NUEVO: DISPARAR EL ANÁLISIS DESPUÉS DE CADA RESPUESTA EXITOSA ---
        analyzeWorkSchedule();

    } catch (qwenError) {
        console.error(`❌ [IA-MODULE] Error processing ${fileName}:`, qwenError);
    }
}

// --- NUEVA FUNCIÓN DE ANÁLISIS (SALIDA LIMPIA EN CONSOLA) ---
function analyzeWorkSchedule() {
    // Si no hay suficientes datos, no hacemos nada.
    if (qwenExtractedData.length < 2) {
        return; // Necesitamos al menos un par de datos para empezar a ver un patrón.
    }

    // 1. Filtrar viajes "Casa -> Oficina"
    const homeToOfficeTrips = qwenExtractedData.filter(trip =>
        trip.destination && trip.destination.toLowerCase().includes("mireka tower")
    );

    if (homeToOfficeTrips.length === 0) return;

    // 2. Calcular horas de llegada a la oficina (pickup + 15 min)
    const ESTIMATED_TRAVEL_TIME_MINUTES = 15;
    const arrivalTimesInMinutes = homeToOfficeTrips.map(trip => {
        const timeInMinutes = timeToMinutes(trip.time);
        return timeInMinutes !== null ? timeInMinutes + ESTIMATED_TRAVEL_TIME_MINUTES : null;
    }).filter(time => time !== null);

    if (arrivalTimesInMinutes.length === 0) return;

    // 3. Deducir hora de inicio (siguiente hora en punto después de la llegada más tardía)
    const latestArrivalInMinutes = Math.max(...arrivalTimesInMinutes);
    let startHour = Math.floor(latestArrivalInMinutes / 60);
    if (latestArrivalInMinutes % 60 !== 0) {
        startHour += 1;
    }
    const startTimeInMinutes = startHour * 60;

    // 4. Calcular hora de fin (+9 horas)
    const WORK_HOURS_DURATION = 9;
    const endTimeInMinutes = startTimeInMinutes + (WORK_HOURS_DURATION * 60);

    // 5. IMPRIMIR RESULTADO LIMPIO EN CONSOLA
    console.clear(); // Limpia la consola para no saturarla con logs anteriores.
    console.log("Start time: " + minutesToTime(startTimeInMinutes));
    console.log("End time: " + minutesToTime(endTimeInMinutes));
}

// --- FUNCIONES AUXILIARES DE TIEMPO (NUEVAS) ---

// Convierte "HH:MM AM/PM" a minutos desde medianoche.
function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
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

// Convierte minutos desde medianoche a "HH:MM AM/PM".
function minutesToTime(minutes) {
    if (minutes >= 24 * 60) minutes -= 24 * 60; // Ajuste por si pasa de medianoche

    const period = minutes >= 12 * 60 ? 'PM' : 'AM';
    let displayHour = Math.floor(minutes / 60);
    if (displayHour > 12) displayHour -= 12;
    if (displayHour === 0) displayHour = 12;
    const displayMinute = minutes % 60;
    return `${displayHour}:${displayMinute.toString().padStart(2, '0')} ${period}`;
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
