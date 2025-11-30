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

        // --- LÓGICA DE NEGOCIO ---

        // Fase 1: Filtros Duros
        let officeArrivals = []; 
        let allCandidates = [];
        let rejectedTrips = [];

        rawTrips.forEach(trip => {
            const reason = checkHardRules(trip);
            if (reason) {
                rejectedTrips.push({ ...trip, status: 'invalid', reason });
            } else {
                allCandidates.push(trip);
                if (isLocation(trip.location, 'office')) {
                    officeArrivals.push(trip);
                }
            }
        });

        // Fase 2: Inferencia del Horario
        const schedule = inferOfficialSchedule(officeArrivals);

        // Fase 3: Validación Final
        let validTrips = [];
        
        allCandidates.forEach(trip => {
            const isOffice = isLocation(trip.location, 'office');
            const isHome = isLocation(trip.location, 'home');
            let isValidTime = false;
            let timeReason = "";

            if (!schedule.start) {
                rejectedTrips.push({ ...trip, status: 'invalid', reason: "Insufficient data to detect shift" });
                return;
            }

            const tripMins = parseTime(trip.time);

            if (isOffice) {
                // Entrada: 60 min antes a 10 min después
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
                // Salida: Después de cumplir 9 horas
                if (tripMins >= schedule.end) {
                    isValidTime = true;
                    timeReason = "Valid Evening Commute (Shift completed)";
                } else {
                    timeReason = `Early departure (Calculated shift ends ${minutesToTime(schedule.end)})`;
                }
            }

            if (isValidTime) {
                validTrips.push({ ...trip, status: 'valid', reason: timeReason });
            } else {
                rejectedTrips.push({ ...trip, status: 'invalid', reason: timeReason });
            }
        });

        // --- CORRECCIÓN DE ORDENAMIENTO (EL PARCHE FINAL) ---
        // Ordenamos ambas listas cronológicamente antes de enviar
        const chronologicalSort = (a, b) => {
            const timeA = getTimestamp(a.date, a.time);
            const timeB = getTimestamp(b.date, b.time);
            return timeA - timeB; // Menor a mayor (Ascendente)
        };

        validTrips.sort(chronologicalSort);
        rejectedTrips.sort(chronologicalSort);
        // ----------------------------------------------------

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

// --- HELPERS ---

// Nuevo Helper robusto para convertir fecha a número comparable
function getTimestamp(dateStr, timeStr) {
    try {
        // Normalizamos fecha: "Nov 1" -> "Nov 01" para evitar errores
        // Pero Javascript suele ser listo. Probemos formato estándar.
        const currentYear = 2025; // Forzamos año para evitar problemas de "año pasado"
        const fullString = `${dateStr} ${currentYear} ${timeStr}`;
        return new Date(fullString).getTime();
    } catch (e) {
        return 0;
    }
}

function inferOfficialSchedule(officeTrips) {
    if (!officeTrips || officeTrips.length === 0) return { start: null, end: null };

    const arrivalTimes = officeTrips
        .map(t => parseTime(t.time))
        .filter(m => m !== null)
        .sort((a,b) => a - b);

    if (arrivalTimes.length === 0) return { start: null, end: null };

    const mid = Math.floor(arrivalTimes.length / 2);
    const medianArrival = arrivalTimes.length % 2 !== 0 
        ? arrivalTimes[mid] 
        : (arrivalTimes[mid - 1] + arrivalTimes[mid]) / 2;

    const startHour = Math.ceil(medianArrival / 60); 
    const officialStartMins = startHour * 60;
    const officialEndMins = officialStartMins + (9 * 60); 

    return { start: officialStartMins, end: officialEndMins };
}

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
