// images-validation-ia.js

// --- ESTADO PERSISTENTE DEL MÓDULO ---
const allExtractedTrips = [];
let processedImagesCount = 0; // <-- NUEVO: Contador de imágenes procesadas.

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

// --- FUNCIÓN DE ANÁLISIS (AHORA RECIBE Y USA EL CONTADOR) ---
function analyzeWorkSchedule(imageCount) { // <-- MODIFICADO: Ahora recibe el contador.
    console.log(`🧠 [PATTERN-DETECTOR] Analyzing with ${allExtractedTrips.length} total trips from ${imageCount} images...`);

    const officeTrips = allExtractedTrips.filter(trip =>
        trip.destination && trip.destination.toLowerCase().includes("mireka tower")
    );

    if (officeTrips.length === 0) {
        console.log("📊 [PATTERN-DETECTOR] No trips to the office found yet.");
        return;
    }

    const arrivalTimesInMinutes = officeTrips.map(trip => {
        const timeInMinutes = timeToMinutes(trip.time);
        return timeInMinutes !== null ? timeInMinutes + 15 : null;
    }).filter(time => time !== null);

    if (arrivalTimesInMinutes.length === 0) {
        console.error("❌ [PATTERN-DETECTOR] Could not parse any valid times from office trips.");
        return;
    }

    const latestArrival = Math.max(...arrivalTimesInMinutes);
    const startHour = Math.floor(latestArrival / 60) + (latestArrival % 60 !== 0 ? 1 : 0);
    const startTimeInMinutes = startHour * 60;
    const endTimeInMinutes = startTimeInMinutes + (9 * 60);

    // --- MODIFICADO: Imprime el contador antes que nada.
    console.clear();
    console.log(`(${imageCount})`);
    console.log("Start time: " + minutesToTime(startTimeInMinutes));
    console.log("End time: " + minutesToTime(endTimeInMinutes));
}

// --- FUNCIÓN PRINCIPAL DEL MÓDULO (AHORA INCREMENTA EL CONTADOR) ---
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
            
            // <-- NUEVO: Incrementa el contador solo si se extrajeron viajes válidos.
            processedImagesCount++; 
            console.log(`✅ [IA-MODULE] Added ${data.trips.length} trips. Total accumulated: ${allExtractedTrips.length}. Images processed: ${processedImagesCount}`);
        }

        // <-- MODIFICADO: Pasa el contador actual a la función de análisis.
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