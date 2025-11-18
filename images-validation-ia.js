// images-validation-ia.js

// --- ESTADO PERSISTENTE DEL MÓDULO ---
// Usamos un array plano para facilitar la búsqueda en todas las fechas.
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
        throw new Error(`Server server: ${response.status} - ${errorText}`);
    }
    return await response.json();
}

// --- FUNCIÓN DE ANÁLISIS CON BÚSQUEDA DE PARES CRUZADOS ---
function analyzeWorkSchedule(imageCount) {
    console.log(`🧠 [PATTERN-DETECTOR] Analyzing patterns from ${allExtractedTrips.length} total trips...`);

    const validStartTimes = {}; // Contador de horas de inicio válidas.
    let validWorkdaysFound = 0;

    // 1. OBTENER TODOS LOS VIAJES A LA OFICINA
    const officeTrips = allExtractedTrips.filter(trip =>
        trip.destination && trip.destination.toLowerCase().includes("mireka tower")
    );

    // 2. OBTENER TODOS LOS VIAJES A CASA
    const homeTrips = allExtractedTrips.filter(trip =>
        trip.destination && trip.destination.toLowerCase().includes("43b lauries rd")
    );

    // 3. POR CADA VIAJE A LA OFICINA, BUSCAR SU PAR VÁLIDO
    for (const officeTrip of officeTrips) {
        if (!officeTrip.time || !officeTrip.date) continue;

        // Calcular hora de inicio y fin para este viaje de ida
        const pickupTimeInMinutes = timeToMinutes(officeTrip.time);
        if (pickupTimeInMinutes === null) continue;

        const arrivalTimeInMinutes = pickupTimeInMinutes + 15;
        let startHour = Math.floor(arrivalTimeInMinutes / 60) + 1;
        if (startHour >= 24) startHour = 0;
        const startTimeInMinutes = startHour * 60;
        const endTimeInMinutes = startTimeInMinutes + (9 * 60);
        const startTimeKey = minutesToTime(startTimeInMinutes);

        // 4. BUSCAR UN VIAJE DE VUELTA QUE CUMPLA LAS REGLAS
        const matchingHomeTrip = homeTrips.find(homeTrip => {
            if (!homeTrip.time || !homeTrip.date) return false;

            const homePickupTimeInMinutes = timeToMinutes(homeTrip.time);
            if (homePickupTimeInMinutes === null) return false;

            // La hora de pickup a casa debe ser DESPUÉS de la hora de fin del trabajo.
            if (homePickupTimeInMinutes < endTimeInMinutes) {
                return false;
            }

            // --- LÓGICA DE FECHAS FLEXIBLE ---
            // El viaje de vuelta debe ser el mismo día o el día siguiente.
            const officeDate = parseSimpleDate(officeTrip.date);
            const homeDate = parseSimpleDate(homeTrip.date);

            if (!officeDate || !homeDate) return false;

            const timeDifferenceInMs = homeDate.getTime() - officeDate.getTime();
            const daysDifference = timeDifferenceInMs / (1000 * 60 * 60 * 24);

            // Válido si es el mismo día (diferencia de 0) o el día siguiente (diferencia de 1).
            return daysDifference === 0 || daysDifference === 1;
        });

        // 5. SI SE ENCUENTRA UN PAR VÁLIDO, CONTARLO
        if (matchingHomeTrip) {
            validWorkdaysFound++;
            validStartTimes[startTimeKey] = (validStartTimes[startTimeKey] || 0) + 1;
            console.log(`   -> ✅ Válido: Ida (${officeTrip.date} ${officeTrip.time}) con Vuelta (${matchingHomeTrip.date} ${matchingHomeTrip.time}). Apunta a inicio: ${startTimeKey}`);
        } else {
            console.log(`   -> ❌ Inválido: Ida (${officeTrip.date} ${officeTrip.time}). No se encontró vuelta válida.`);
        }
    }

    // 6. ENCONTRAR LA HORA DE INICIO MÁS COMÚN
    let deducedStartTime = null;
    let maxCount = 0;

    for (const time in validStartTimes) {
        if (validStartTimes[time] > maxCount) {
            maxCount = validStartTimes[time];
            deducedStartTime = time;
        }
    }

    if (!deducedStartTime) {
        console.clear();
        console.log(`(0)`);
        console.log("No se encontraron jornadas completas y válidas para determinar un patrón.");
        return;
    }

    // 7. MOSTRAR RESULTADO FINAL
    const finalStartTimeInMinutes = timeToMinutes(deducedStartTime);
    const finalEndTimeInMinutes = finalStartTimeInMinutes + (9 * 60);

    console.clear();
    console.log(`(${validWorkdaysFound})`); // Contador de jornadas válidas.
    console.log("Start time: " + deducedStartTime);
    console.log("End time: " + minutesToTime(finalEndTimeInMinutes));
    console.log(`(Pattern based on ${validWorkdaysFound} complete workdays)`);
}


// --- FUNCIÓN PRINCIPAL DEL MÓDULO (AHORA USA UN ARRAY PLANO) ---
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
                allExtractedTrips.push(trip); // Añadir a la lista global.
            });
            
            processedImagesCount++;
            console.log(`✅ [IA-MODULE] Processed image. Total trips in memory: ${allExtractedTrips.length}`);
        }

        analyzeWorkSchedule(processedImagesCount);

    } catch (error) {
        console.error(`❌ [IA-MODULE] Error processing ${fileName}:`, error);
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