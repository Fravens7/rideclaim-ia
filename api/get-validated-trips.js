import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        const { batchId } = req.query;
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        // 1. Obtener Viajes Crudos
        const { data: rawTrips, error } = await supabase
            .from('tripsimg')
            .select('*')
            .eq('batch_id', batchId);

        if (error || !rawTrips) return res.status(500).json({ error: "DB Error" });

        // --- LÓGICA NORMATIVA (STRICT 9-HOUR RULE) ---

        // Fase 1: Filtros Duros (Ubicación, Precio, Fecha)
        let officeArrivals = []; // Solo usaremos estos para calcular el horario
        let allCandidates = [];
        let rejectedTrips = [];

        rawTrips.forEach(trip => {
            const reason = checkHardRules(trip);
            if (reason) {
                rejectedTrips.push({ ...trip, status: 'invalid', reason });
            } else {
                // Es un candidato válido (pasó precio y lugar)
                allCandidates.push(trip);
                
                // Si es un viaje HACIA la oficina, lo guardamos para el cálculo
                if (isLocation(trip.location, 'office')) {
                    officeArrivals.push(trip);
                }
            }
        });

        // Fase 2: Inferencia del Horario Oficial (Rounding Up)
        const schedule = inferOfficialSchedule(officeArrivals);

        // Fase 3: Veredicto Final
        const validTrips = [];
        
        allCandidates.forEach(trip => {
            const isOffice = isLocation(trip.location, 'office');
            const isHome = isLocation(trip.location, 'home');
            let isValidTime = false;
            let timeReason = "";

            if (!schedule.start) {
                // Si no hay suficientes datos para calcular horario, no podemos validar tiempo
                // Opción A: Rechazar todo. Opción B: Dejar pendiente.
                // Según tu regla estricta: si no sé tu horario, no puedo pagarte.
                rejectedTrips.push({ ...trip, status: 'invalid', reason: "Insufficient office trips to determine shift" });
                return;
            }

            const tripMins = parseTime(trip.time);

            if (isOffice) {
                // REGLA ENTRADA: Debe llegar ANTES o MUY CERCA de la hora de inicio
                // Ventana: Desde 60 min antes hasta 10 min después (tolerancia tráfico)
                // Ej: Inicio 1:00 PM. Válido: 12:00 PM a 1:10 PM.
                const validStart = schedule.start - 60;
                const validEnd = schedule.start + 10;
                
                if (tripMins >= validStart && tripMins <= validEnd) {
                    isValidTime = true;
                    timeReason = "Valid Morning Commute";
                } else {
                    timeReason = `Outside entry window (Shift starts ${minutesToTime(schedule.start)})`;
                }
            } 
            
            else if (isHome) {
                // REGLA SALIDA ESTRICTA: Debe irse DESPUÉS de cumplir las 9 horas
                // Ej: Salida 10:00 PM. Viaje 9:34 PM -> INVALID. Viaje 10:02 PM -> VALID.
                // Tolerancia: 0 minutos antes. (O quizás 5 min de gracia? Dejo 0 por ahora).
                
                if (tripMins >= schedule.end) {
                    isValidTime = true;
                    timeReason = "Valid Evening Commute (Shift completed)";
                } else {
                    timeReason = `Left too early (Shift ends ${minutesToTime(schedule.end)})`;
                }
            }

            if (isValidTime) {
                validTrips.push({ ...trip, status: 'valid', reason: timeReason });
            } else {
                rejectedTrips.push({ ...trip, status: 'invalid', reason: timeReason });
            }
        });

        // Totales
        const totalAmount = validTrips.reduce((sum, t) => sum + parseAmount(t.amount), 0);
        const scheduleText = schedule.start 
            ? `${minutesToTime(schedule.start)} - ${minutesToTime(schedule.end)} (9h Shift)` 
            : "Unknown Schedule";

        return res.status(200).json({
            trips: { valid: validTrips, invalid: rejectedTrips },
            summary: { valid: validTrips.length, invalid: rejectedTrips.length },
            totalValid: totalAmount.toFixed(2),
            inferredSchedule: scheduleText
        });

    } catch (err) {
        console.error("Critical Error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// --- LOGICA MATEMÁTICA PURA ---

function inferOfficialSchedule(officeTrips) {
    if (!officeTrips || officeTrips.length === 0) return { start: null, end: null };

    // 1. Obtener minutos de llegada
    const arrivalTimes = officeTrips
        .map(t => parseTime(t.time))
        .filter(m => m !== null)
        .sort((a,b) => a - b);

    if (arrivalTimes.length === 0) return { start: null, end: null };

    // 2. Calcular Mediana de llegada real (Ej: 12:43 PM)
    const mid = Math.floor(arrivalTimes.length / 2);
    const medianArrival = arrivalTimes.length % 2 !== 0 
        ? arrivalTimes[mid] 
        : (arrivalTimes[mid - 1] + arrivalTimes[mid]) / 2;

    // 3. PROYECCIÓN (ROUND UP): Redondear a la siguiente hora en punto
    // Si la mediana es 12:43 (763 min) -> Dividir entre 60 -> 12.71 -> Ceil: 13 -> 13 * 60 = 780 (1:00 PM)
    // Si la mediana es 12:10... ¿Debería ser 1:00 PM o 12:30? 
    // Tu lógica sugiere que "intentan llegar antes". Asumiremos redondeo a la hora superior.
    
    const startHour = Math.ceil(medianArrival / 60); 
    const officialStartMins = startHour * 60;

    // 4. REGLA 9 HORAS
    const officialEndMins = officialStartMins + (9 * 60); // + 540 minutos

    return {
        start: officialStartMins,
        end: officialEndMins
    };
}

// --- HELPERS BÁSICOS ---

function checkHardRules(trip) {
    if (!trip.date || !trip.date.includes('Nov')) return "Date not in Nov 2025";
    const amount = parseAmount(trip.amount);
    if (amount < 150 || amount > 600) return `Amount out of range (${amount})`;
    
    const isOffice = isLocation(trip.location, 'office');
    const isHome = isLocation(trip.location, 'home');
    if (!isOffice && !isHome) return "Invalid Location";

    return null; 
}

function isLocation(text, type) {
    if (!text) return false;
    if (type === 'office') return /Mireka/i.test(text);
    if (type === 'home') return /Lauries/i.test(text);
    return false;
}

function parseAmount(str) {
    return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
}

function parseTime(timeStr) {
    try {
        const match = String(timeStr).match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return null;
        let h = parseInt(match[1]), m = parseInt(match[2]);
        if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    } catch { return null; }
}

function minutesToTime(minutes) {
    let h = Math.floor(minutes / 60) % 24;
    let m = Math.floor(minutes % 60);
    const p = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2,'0')} ${p}`;
}
