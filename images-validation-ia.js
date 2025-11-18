// images-validation-ia.js

// --- ESTADO PERSISTENTE DEL MÓDULO ---
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
        throw new Error(`Server error: ${response.status} - ${errorText}`);
    }
    return await response.json();
}

// --- FUNCIÓN DE ANÁLISIS POR VALIDACIÓN DE PARES (NUEVA LÓGICA) ---
function analyzeWorkSchedule(imageCount) {
    console.log(`🧠 [PATTERN-DETECTOR] Analyzing complete workdays from ${Object.keys(tripsByDate).length} days...`);

    const validStartTimes = {}; // Objeto para contar las horas de inicio de JORNADAS VÁLIDAS.
    let validDaysFound = 0;

    // 1. ITERAR SOBRE CADA DÍA
    for (const date in tripsByDate) {
        const dailyTrips = tripsByDate[date];
        
        // 2. FILTRAR VIAJES VÁLIDOS (solo oficina y casa)
        const validTrips = dailyTrips.filter(trip => {
            const dest = trip.destination ? trip.destination.toLowerCase() : '';
            return dest.includes("mireka tower") || dest.includes("43b lauries rd");
        });

        if (validTrips.length < 2) continue; // Necesitamos al menos ida y vuelta.

        let officeTrip = null;
        let homeTrip = null;

        // 3. ENCONTRAR EL VIAJE A LA OFICINA
        officeTrip = validTrips.find(trip => trip.destination.toLowerCase().includes("mireka tower"));

        if (!officeTrip || !officeTrip.time) {
            console.log(`   -> ${date}: Descartado, no hay viaje a la oficina.`);
            continue; // Si no hay viaje a la oficina, el día no es válido.
        }

        // 4. CALCULAR HORA DE INICIO Y FIN DE TRABAJO
        const pickupTimeInMinutes = timeToMinutes(officeTrip.time);
        if (pickupTimeInMinutes === null) continue;

        const arrivalTimeInMinutes = pickupTimeInMinutes + 15;
        let startHour = Math.floor(arrivalTimeInMinutes / 60) + 1;
        if (startHour >= 24) startHour = 0;
        const startTimeInMinutes = startHour * 60;
        const endTimeInMinutes = startTimeInMinutes + (9 * 60);
        
        const startTimeKey = minutesToTime(startTimeInMinutes);

        // 5. BUSCAR UN VIAJE DE VUELTA VÁLIDO
        homeTrip = validTrips.find(trip => {
            if (!trip.destination.toLowerCase().includes("43b lauries rd") || !trip.time) {
                return false;
            }
            const homePickupTimeInMinutes = timeToMinutes(trip.time);
            // La clave: la hora de pickup del viaje a casa debe ser >= a la hora de fin del trabajo.
            return homePickupTimeInMinutes >= endTimeInMinutes;
        });

        // 6. SI SE ENCUENTRA UN PAR VÁLIDO, CONTAR LA HORA DE INICIO
        if (homeTrip) {
            validDaysFound++;
            validStartTimes[startTimeKey] = (validStartTimes[startTimeKey] || 0) + 1;
            console.log(`   -> ✅ ${date}: Jornada válida. Inicio: ${startTimeKey}, Fin: ${minutesToTime(endTimeInMinutes)}. Viaje a casa: ${homeTrip.time}`);
        } else {
            console.log(`   -> ❌ ${date}: Descartado, no hay viaje de vuelta válido después de las ${minutesToTime(endTimeInMinutes)}.`);
        }
    }

    // 7. ENCONTRAR LA HORA DE INICIO MÁS COMÚN ENTRE LOS DÍAS VÁLIDOS
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
        console.log(`(${imageCount})`);
        console.log("No se encontraron jornadas completas y válidas para determinar un patrón.");
        return;
    }

    // 8. CALCULAR HORA DE FIN Y MOSTRAR RESULTADO FINAL
    const finalStartTimeInMinutes = timeToMinutes(deducedStartTime);
    const finalEndTimeInMinutes = finalStartTimeInMinutes + (9 * 60);

    console.clear();
    console.log(`(${validDaysFound})`); // <-- MODIFICADO: El contador ahora es de días válidos.
    console.log("Start time: " + deducedStartTime);
    console.log("End time: " + minutesToTime(finalEndTimeInMinutes));
    console.log(`(Pattern based on ${validDaysFound} complete workdays)`);
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
                if (trip.date) {
                    if (!tripsByDate[trip.date]) {
                        tripsByDate[trip.date] = [];
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