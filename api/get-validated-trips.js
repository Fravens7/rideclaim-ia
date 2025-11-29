import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        console.log("🔍 Starting validation request...");

        // Validación de método
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const { batchId } = req.query;
        
        // Validación de batchId
        if (!batchId) {
            console.error("❌ Missing batchId");
            return res.status(400).json({ error: "Missing batchId" });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error("❌ Missing Supabase credentials");
            return res.status(500).json({ error: "Server configuration error" });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Obtener Horario del Lote
        const { data: schedules, error: scheduleError } = await supabase
            .from('employee_schedules')
            .select('*')
            .eq('batch_id', batchId);
        
        if (scheduleError) {
            console.error("⚠️ Error fetching schedule:", scheduleError);
        }
        
        const schedule = schedules && schedules.length > 0 ? schedules[0] : null;

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

        // PROTECCIÓN 2: Si no hay viajes, devolvemos array vacío
        if (!trips || trips.length === 0) {
            return res.status(200).json({
                valid: [], 
                invalid: [], 
                pending: [],
                totalValid: "0.00",
                summary: { validCount: 0, invalidCount: 0 }
            });
        }

        // 3. Validar uno por uno
        const valid = [];
        const invalid = [];
        const pending = [];
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
                console.error("⚠️ Error validating trip:", trip.id, innerError);
                pending.push({ ...trip, validation_reason: "Internal processing error", status: 'pending' });
            }
        });

        console.log(`✅ Validation complete. Valid: ${valid.length}, Invalid: ${invalid.length}`);

        return res.status(200).json({
            valid, 
            invalid, 
            pending,
            totalValid: totalAmount.toFixed(2),
            summary: {
                validCount: valid.length,
                invalidCount: invalid.length,
                pendingCount: pending.length
            }
        });

    } catch (err) {
        console.error("💥 CRITICAL API ERROR:", err);
        return res.status(500).json({ error: err.message, stack: err.stack });
    }
}

// --- FUNCIONES HELPER (FUERA DEL HANDLER) ---

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
        
        if (startMins === null || endMins === null) {
             return { status: 'pending', reason: 'Schedule time format error' };
        }

        // Ventanas de tolerancia
        const morningStart = startMins - 90; 
        const morningEnd = startMins + 30;
        const eveningStart = endMins - 30;
        const eveningEnd = endMins + 240; // 4 horas después

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

function parseAmount(str) {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
}

function parseTime(timeStr) {
    try {
        if (!timeStr) return null;
        const str = String(timeStr);
        const match = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
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
