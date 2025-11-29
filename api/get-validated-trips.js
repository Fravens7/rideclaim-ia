import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        const { batchId } = req.query;
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        // 1. Obtener Horario del Lote
        const { data: schedules } = await supabase
            .from('employee_schedules')
            .select('*')
            .eq('batch_id', batchId);
        
        const schedule = schedules?.[0] || null;

        // 2. Obtener Viajes del Lote
        const { data: trips } = await supabase
            .from('tripsimg')
            .select('*')
            .eq('batch_id', batchId)
            .order('date', { ascending: true }); // Ordenar por fecha para leer mejor

        // 3. Validar uno por uno
        const valid = [], invalid = [], pending = [];
        let totalAmount = 0;

        trips.forEach(trip => {
            const result = validateTrip(trip, schedule);
            
            const processedTrip = { ...trip, validation_reason: result.reason };

            if (result.status === 'valid') {
                valid.push(processedTrip);
                totalAmount += parseAmount(trip.amount);
            } else if (result.status === 'invalid') {
                invalid.push(processedTrip);
            } else {
                pending.push(processedTrip);
            }
        });

        return res.json({
            valid, invalid, pending,
            totalValid: totalAmount.toFixed(2),
            summary: {
                validCount: valid.length,
                invalidCount: invalid.length
            }
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

// --- LOGICA DE VALIDACIÓN ---
function validateTrip(trip, schedule) {
    // 1. Validar Fecha (Estricto NOVIEMBRE)
    // Buscamos "Nov" insensible a mayusculas
    if (!trip.date || !/Nov/i.test(trip.date)) {
        return { status: 'invalid', reason: 'Receipt not from November' };
    }

    // 2. Validar Monto (150 - 600 LKR)
    const amt = parseAmount(trip.amount);
    if (amt < 150 || amt > 600) {
        return { status: 'invalid', reason: `Amount out of range (${amt})` };
    }

    // 3. Validar Ubicación
    const isOffice = trip.location && trip.location.includes('Mireka');
    const isHome = trip.location && trip.location.includes('Lauries');

    if (!isOffice && !isHome) {
        return { status: 'invalid', reason: 'Unknown location' };
    }

    // 4. Validar Horario (Si existe schedule)
    if (schedule && trip.time) {
        const tripMins = parseTime(trip.time);
        if (tripMins === null) return { status: 'pending', reason: 'Invalid time format' };

        const startMins = parseTime(schedule.work_start_time);
        const endMins = parseTime(schedule.work_end_time);

        // Ventanas de tolerancia
        // Mañana: Entre (Entrada - 90min) y (Entrada + 30min) -> Ampliamos ventana para ser flexibles
        const morningStart = startMins - 90; 
        const morningEnd = startMins + 30;

        // Tarde: Entre (Salida - 30min) y (Salida + 4 horas)
        const eveningStart = endMins - 30;
        const eveningEnd = endMins + 240;

        if (isOffice) {
            if (tripMins >= morningStart && tripMins <= morningEnd) {
                return { status: 'valid', reason: 'Morning commute match' };
            }
            return { status: 'invalid', reason: `Outside morning window (${minutesToTime(morningStart)}-${minutesToTime(morningEnd)})` };
        }

        if (isHome) {
            if (tripMins >= eveningStart && tripMins <= eveningEnd) {
                return { status: 'valid', reason: 'Evening commute match' };
            }
            return { status: 'invalid', reason: `Outside evening window (${minutesToTime(eveningStart)}-${minutesToTime(eveningEnd)})` };
        }
    }

    // Si no hay horario aun (raro porque tenemos fallback), o falla algo más
    return { status: 'pending', reason: 'Awaiting schedule analysis' };
}

function parseAmount(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
}

function parseTime(timeStr) {
    try {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
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
