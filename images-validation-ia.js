// images-validation-ia.js

// --- ESTADO PERSISTENTE DEL MÓDULO ---
// Cambiamos a un objeto para agrupar viajes por fecha. Es más ordenado.
const tripsByDate = {};
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
        throw new Error(`Server server: ${response.status} - ${errorText}`);
    }
    return await response.json();
}

// --- FUNCIÓN DE ANÁLISIS INTELIGENTE (NUEVA LÓGICA) ---
function analyzeWorkSchedule(imageCount) {
    console.log(`🧠 [PATTERN-DETECTOR] Analyzing patterns from ${Object.keys(tripsByDate).length} days...`);

    const startTimeCounts = {}; // Objeto para contar la frecuencia de cada hora de inicio.

    // 1. ITERAR SOBRE CADA DÍA PARA ENCONTRAR EL PATRÓN
    for (const date in tripsByDate) {
        const dailyTrips = tripsByDate[date];
        
        // 2. ENCONTRAR EL VIAJE A LA OFICINA DE ESE DÍA
        const officeTrip = dailyTrips.find(trip =>
            trip.destination && trip.destination.toLowerCase().includes("mireka tower")
        );

        if (officeTrip && officeTrip.time) {
            // 3. CALCULAR LA HORA DE LLEGADA Y LA HORA DE INICIO CORRESPONDIENTE
            const pickupTimeInMinutes = timeToMinutes(officeTrip.time);
            if (pickupTimeInMinutes === null) continue; // Ignorar si la hora es inválida

            const arrivalTimeInMinutes = pickupTimeInMinutes + 15; // Sumar tiempo de viaje
            
            // La hora de inicio es la siguiente hora en punto DESPUÉS de la llegada.
            let startHour = Math.floor(arrivalTimeInMinutes / 60) + 1;
            if (startHour >= 24) startHour = 0; // Ajuste si pasa de medianoche
            
            const startTimeKey = minutesToTime(startHour * 60); // Formatear a "1:00 PM"

            // 4. CONTAR ESTA HORA DE INICIO
            startTimeCounts[startTimeKey] = (startTimeCounts[startTimeKey] || 0) + 1;
            console.log(`   -> ${date}: Llegada estimada a ${minutesToTime(arrivalTimeInMinutes)}, apunta a hora de inicio: ${startTimeKey}`);
        }
    }

    // 5. ENCONTRAR LA HORA DE INICIO MÁS COMÚN (LA MODA)
    let deducedStartTime = null;
    let maxCount = 0;

    for (const time in startTimeCounts) {
        if (startTimeCounts[time] > maxCount) {
            maxCount = startTimeCounts[time];
            deducedStartTime = time;
        }
    }

    if (!deducedStartTime) {
        console.log("📊 [PATTERN-DETECTOR] No se pudo determinar un patrón de horario.");
        return;
    }

    // 6. CALCULAR HORA DE FIN Y MOSTRAR RESULTADO
    const startTimeInMinutes = timeToMinutes(deducedStartTime);
    const endTimeInMinutes = startTimeInMinutes + (9 * 60);

    console.clear();
    console.log(`(${imageCount})`);
    console.log("Start time: " + deducedStartTime);
    console.log("End time: " + minutesToTime(endTimeInMinutes));
    console.log(`(Pattern repeated ${maxCount} times)`);
}

// --- FUNCIÓN PRINCIPAL DEL MÓDULO (AHORA GUARDA POR FECHA) ---
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
                // Asegurarnos de que el viaje tenga una fecha para poder agruparlo.
                if (trip.date) {
                    if (!tripsByDate[trip.date]) {
                        tripsByDate[trip.date] = []; // Crear una nueva entrada para esa fecha si no existe.
                    }
                    tripsByDate[trip.date].push(trip);
                }
            });
            
            processedImagesCount++;
            console.log(`✅ [IA-MODULE] Processed image. Total unique days analyzed: ${Object.keys(tripsByDate).length}`);
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