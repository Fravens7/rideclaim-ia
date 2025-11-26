// images-validation-ia.js

// --- ESTADO PERSISTENTE DEL MÓDULO ---
const allExtractedTrips = [];
let processedImagesCount = 0;

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

// --- NUEVA FUNCIÓN DE ANÁLISIS BASADA EN FRECUENCIA ---
function analyzeWorkSchedule(imageCount) {
    console.log(`🧠 [PATTERN-DETECTOR] Analyzing patterns from ${allExtractedTrips.length} total trips...`);

    // --- NUEVO: LOG DETALLADO DE CADA VIAJE ---
    allExtractedTrips.forEach((trip, index) => {
        console.log(`${index + 1}: Destination. ${trip.destination}. Time: ${trip.time}`);
    });

    // 1. OBTENER TODOS LOS VIAJES A LA OFICINA
    const officeTrips = allExtractedTrips.filter(trip =>
        trip.destination && trip.destination.toLowerCase().includes("mireka tower")
    );

    if (officeTrips.length === 0) {
        console.log("📊 [PATTERN-DETECTOR] No trips to the office found yet.");
        return;
    }

    // 2. CREAR UN MAPA DE FRECUENCIA PARA LAS HORAS DE INICIO
    const startTimeFrequency = {};

    officeTrips.forEach(trip => {
        const timeInMinutes = timeToMinutes(trip.time);
        if (timeInMinutes === null) return; // Ignorar si la hora es inválida

        // Calcular la hora de llegada y la hora de inicio "en punto" a la que apunta
        const arrivalTimeInMinutes = timeInMinutes + 15; // Sumar tiempo de viaje
        const startHour = Math.floor(arrivalTimeInMinutes / 60) + 1;
        const startTimeInMinutes = startHour * 60;
        const startTimeKey = minutesToTime(startTimeInMinutes);

        // Incrementar la frecuencia de esta hora de inicio
        startTimeFrequency[startTimeKey] = (startTimeFrequency[startTimeKey] || 0) + 1;
        console.log(`   -> Viaje a ${trip.destination} a las ${trip.time} apunta a inicio: ${startTimeKey}`);
    });

    // 3. ENCONTRAR LA HORA DE INICIO MÁS FRECUENTE (LA MODA)
    let mostFrequentStartTime = null;
    let maxCount = 0;

    for (const time in startTimeFrequency) {
        if (startTimeFrequency[time] > maxCount) {
            maxCount = startTimeFrequency[time];
            mostFrequentStartTime = time;
        }
    }

    // 4. MOSTRAR RESULTADO FINAL (sin limpiar consola para mantener el histórico)
    if (!mostFrequentStartTime) {
        console.log(`(0)`);
        console.log("No se pudo determinar un patrón de horario.");
        return;
    }

    const finalStartTimeInMinutes = timeToMinutes(mostFrequentStartTime);
    const finalEndTimeInMinutes = finalStartTimeInMinutes + (9 * 60);

    console.log(`(${maxCount})`); // <-- El contador ahora es la frecuencia del patrón.
    console.log("Start time: " + mostFrequentStartTime);
    console.log("End time: " + minutesToTime(finalEndTimeInMinutes));
}

// --- FUNCIÓN PRINCIPAL DEL MÓDULO (SIN CAMBIOS) ---
export async function processImageWithAI(fileName, ocrText, imageDataURL) {
    console.log(`🤖 [IA-MODULE] Processing ${fileName}...`);
    try {
        const base64Image = imageDataURL.split(',')[1];
        const qwenResult = await extractWithQwen(base64Image, fileName, 'image/jpeg');

        const rawText = qwenResult.extractedText;
        let cleanedText = rawText.trim();
        if (cleanedText.startsWith('```json')) cleanedText = cleanedText.substring(7);
        if (cleanedText.endsWith('```')) cleanedText = cleanedText.substring(0, cleanedText.length - 3);
        cleanedText = cleanedText.trim();

        const data = JSON.parse(cleanedText);

        if (data.trips && Array.isArray(data.trips)) {
            data.trips.forEach(trip => {
                allExtractedTrips.push(trip);
            });

            processedImagesCount++;
            console.log(`✅ [IA-MODULE] Added ${data.trips.length} trips. Total accumulated: ${allExtractedTrips.length}. Images processed: ${processedImagesCount}`);
        }

        analyzeWorkSchedule(processedImagesCount);

    } catch (error) {
        console.error(`❌ [IA-MODULE] Error processing ${fileName}:`, error);
    }
}

// --- FUNCIONES AUXILIARES DE TIEMPO ---
// (Sin cambios)
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