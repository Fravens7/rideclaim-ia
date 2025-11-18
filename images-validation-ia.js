// images-validation-ia.js

// --- ESTADO PERSISTENTE DEL MÓDULO ---
const allExtractedTrips = [];
let processedImagesCount = 0;

// --- NUEVO: BANDERA PARA CONTROLAR EL PROCESAMIENTO ---
let isProcessing = false;
let processingQueue = [];

// --- FUNCIÓN AUXILIAR PARA ENVIAR A LA API QWEN (REVERTIDA A TU VERSIÓN) ---
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

// --- FUNCIÓN DE ANÁLISIS (SIN CAMBIOS, LA ÚLTIMA VERSIÓN CORRECTA) ---
function analyzeWorkSchedule(imageCount) {
    console.log(`🧠 [PATTERN-DETECTOR] Analyzing patterns from ${allExtractedTrips.length} total trips...`);

    const validStartTimes = {};
    let validWorkdaysFound = 0;

    const officeTrips = allExtractedTrips.filter(trip =>
        trip.destination && trip.destination.toLowerCase().includes("mireka tower")
    );

    const homeTrips = allExtractedTrips.filter(trip =>
        trip.destination && trip.destination.toLowerCase().includes("43b lauries rd")
    );

    for (const officeTrip of officeTrips) {
        if (!officeTrip.time || !officeTrip.date) continue;

        const pickupTimeInMinutes = timeToMinutes(officeTrip.time);
        if (pickupTimeInMinutes === null) continue;

        const arrivalTimeInMinutes = pickupTimeInMinutes + 15;
        let startHour = Math.floor(arrivalTimeInMinutes / 60) + 1;
        if (startHour >= 24) startHour = 0;
        const startTimeInMinutes = startHour * 60;
        const endTimeInMinutes = startTimeInMinutes + (9 * 60);
        const startTimeKey = minutesToTime(startTimeInMinutes);

        let matchingHomeTrip = null;

        // --- PASO 1: BUSCAR EN EL MISMO DÍA ---
        matchingHomeTrip = homeTrips.find(homeTrip => {
            if (!homeTrip.time || !homeTrip.date) return false;
            const homePickupTimeInMinutes = timeToMinutes(homeTrip.time);
            if (homePickupTimeInMinutes < endTimeInMinutes) return false;
            return homeTrip.date === officeTrip.date;
        });

        // --- PASO 2: SI NO SE ENCONTRÓ, BUSCAR AL DÍA SIGUIENTE ---
        if (!matchingHomeTrip) {
            const officeDate = parseSimpleDate(officeTrip.date);
            const nextDay = new Date(officeDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = formatDate(nextDay);

            matchingHomeTrip = homeTrips.find(homeTrip => {
                if (!homeTrip.time || !homeTrip.date) return false;
                const homePickupTimeInMinutes = timeToMinutes(homeTrip.time);
                if (homePickupTimeInMinutes < endTimeInMinutes) return false;
                return homeTrip.date === nextDayStr;
            });
        }

        if (matchingHomeTrip) {
            validWorkdaysFound++;
            validStartTimes[startTimeKey] = (validStartTimes[startTimeKey] || 0) + 1;
            console.log(`   -> ✅ Válido: Ida (${officeTrip.date} ${officeTrip.time}) con Vuelta (${matchingHomeTrip.date} ${matchingHomeTrip.time}). Apunta a inicio: ${startTimeKey}`);
        } else {
            console.log(`   -> ❌ Inválido: Ida (${officeTrip.date} ${officeTrip.time}). No se encontró vuelta válida.`);
        }
    }

    let deducedStartTime = null;
    let maxCount = 0;

    for (const time in validStartTimes) {
        if (validStartTimes[time] > maxCount) {
            maxCount = validStartTimes[time];
            deducedStartTime = time;
        }
    }

    console.clear();
    if (!deducedStartTime) {
        console.log(`(0)`);
        console.log("No se encontraron jornadas completas y válidas para determinar un patrón.");
        return;
    }

    const finalStartTimeInMinutes = timeToMinutes(deducedStartTime);
    const finalEndTimeInMinutes = finalStartTimeInMinutes + (9 * 60);

    console.log(`(${validWorkdaysFound})`);
    console.log("Start time: " + deducedStartTime);
    console.log("End time: " + minutesToTime(finalEndTimeInMinutes));
    console.log(`(Pattern based on ${validWorkdaysFound} complete workdays)`);
}


// --- FUNCIÓN PRINCIPAL DEL MÓDULO (CON LÓGICA DE COLA) ---
export async function processImageWithAI(fileName, ocrText, imageDataURL) {
    // Añadimos la imagen a la cola de procesamiento.
    processingQueue.push({ fileName, ocrText, imageDataURL });

    // Si ya se está procesando una imagen, no hacemos nada más.
    // La cola se encargará de procesar las demás cuando termine la actual.
    if (isProcessing) {
        console.log(`🕐 [IA-MODULE] ${fileName} added to queue. Current queue length: ${processingQueue.length}`);
        return;
    }

    // Iniciamos el procesamiento de la cola.
    processQueue();
}

// --- NUEVA FUNCIÓN PARA PROCESAR LA COLA ---
async function processQueue() {
    if (processingQueue.length === 0) {
        isProcessing = false; // No hay más nada que procesar.
        return;
    }

    isProcessing = true;
    const { fileName, ocrText, imageDataURL } = processingQueue.shift(); // Tomamos la primera imagen de la cola.

    console.log(`🤖 [IA-MODULE] Processing ${fileName}... (Queue: ${processingQueue.length} remaining)`);
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
        }

        analyzeWorkSchedule(processedImagesCount);

    } catch (error) {
        console.error(`❌ [IA-MODULE] Error processing ${fileName}:`, error);
    } finally {
        // Pequeña pausa antes de procesar la siguiente imagen para evitar el bloqueo.
        setTimeout(() => {
            processQueue(); // Llamada recursiva para procesar la siguiente en la cola.
        }, 1500); // 1.5 segundos de pausa.
    }
}

// --- FUNCIONES AUXILIARES ---

// Convierte "Nov 10" a un objeto de fecha real (año actual por defecto).
function parseSimpleDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split(' ');
    if (parts.length !== 2) return null;
    const month = parts[0].toLowerCase();
    const day = parseInt(parts[1], 10);
    const monthMap = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
    const monthNum = monthMap[month.substring(0, 3)];
    if (monthNum === undefined || isNaN(day)) return null;
    return new Date(new Date().getFullYear(), monthNum, day);
}

// Formatea un objeto Date a "Nov 10".
function formatDate(dateObj) {
    if (!dateObj) return null;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[dateObj.getMonth()]} ${dateObj.getDate()}`;
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