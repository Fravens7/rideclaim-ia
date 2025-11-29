import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        const { batchId } = req.query;
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        // 1. Obtener Horario del Lote
        const { data: schedules, error: scheduleError } = await supabase
            .from('employee_schedules')
            .select('*')
            .eq('batch_id', batchId);
        
        if (scheduleError) console.error("⚠️ Error fetching schedule:", scheduleError);
        const schedule = schedules?.[0] || null;

        // 2. Obtener Viajes del Lote
        const { data: trips, error: tripsError } = await supabase
            .from('tripsimg')
            .select('*')
            .eq('batch_id', batchId)
            .order('date', { ascending: true });

        // PROTECCIÓN 1: Manejo de error de base de datos
        if (tripsError) {
            console.error("❌ Error fetching trips:", tripsError);
            return res.status(500).json({ error: "Database error fetching trips" });
        }

        // PROTECCIÓN 2: Si no hay viajes, devolvemos array vacío en lugar de romper
        if (!trips || trips.length === 0) {
            return res.json({
                valid: [], invalid: [], pending: [],
                totalValid: "0.00",
                summary: { validCount: 0, invalidCount: 0 }
            });
        }

        // 3. Validar uno por uno
        const valid = [], invalid = [], pending = [];
        let totalAmount = 0;

        trips.forEach(trip => {
            try {
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
            } catch (innerError) {
                console.error("⚠️ Error validating specific trip:", trip, innerError);
                // Si falla un viaje específico, lo marcamos como error en lugar de tumbar toda la API
                pending.push({ ...trip, validation_reason: "Internal processing error", status: 'pending' });
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
        console.error("💥 CRITICAL API ERROR:", err);
        return res.status(500).json({ error: err.message });
    }
}

// --- LOGICA DE VALIDACIÓN ---
function validateTrip(trip, schedule) {
    // 1. Validar Fecha (Estricto NOVIEMBRE)
    if (!trip.date || !/Nov/i.test(trip.date)) {
        return { status: 'invalid', reason: 'Receipt not from November' };
    }

    // 2. Validar Monto (150 - 600 LKR)
    const amt = parseAmount(trip.amount);
    if (amt < 150 || amt > 600) {
        return { status: 'invalid', reason: `Amount out of range (${amt})` };
    }

    // 3. Validar Ubicación
    const location = trip.location || "";
    // Búsqueda insensible a mayúsculas/minúsculas
    const isOffice = /Mireka/i.test(location);
    const isHome = /Lauries/i.test(location);

    if (!isOffice && !isHome) {
        return { status: 'invalid', reason: 'Unknown location' };
    }

    // 4. Validar Horario (Si existe schedule)
    if (schedule && trip.time) {
        const tripMins = parseTime(trip.time);
        if (tripMins === null) return { status: 'pending', reason: 'Invalid time format' };

        const startMins = parseTime(schedule.work_start_time);
        const endMins = parseTime(schedule.work_end_time);
        
        // Si falló el parseo del horario del empleado, no podemos validar
        if (startMins === null || endMins === null) {
             return { status: 'pending', reason: 'Schedule time format error' };
        }

        const morningStart = startMins - 90; 
        const morningEnd = startMins + 30;
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

    return { status: 'pending', reason: 'Awaiting schedule analysis' };
}

// PROTECCIÓN 3: Parseo de Monto seguro
function parseAmount(str) {
    if (!str) return 0;
    // Convertimos a String primero por si viene como número desde la IA
    return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
}

// PROTECCIÓN 4: Parseo de Hora seguro
function parseTime(timeStr) {
    try {
        if (!timeStr) return null;
        const str = String(timeStr); // Aseg
