// --- API para obtener viajes validados con horario inferido ---
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        console.log("🔍 Getting validated trips from Supabase");

        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error("❌ Missing Supabase credentials");
            return res.status(500).json({ error: "Missing Supabase credentials" });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Obtener horario inferido
        const { data: schedules, error: scheduleError } = await supabase
            .from('employee_schedules')
            .select('*')
            .eq('employee_id', 'default_employee')
            .order('last_analyzed', { ascending: false })
            .limit(1);

        const hasSchedule = schedules && schedules.length > 0;
        const schedule = hasSchedule ? schedules[0] : null;

        console.log(`📅 Schedule found: ${hasSchedule ? 'Yes' : 'No'}`);
        if (hasSchedule) {
            console.log(`⏰ Work hours: ${schedule.work_start_time} - ${schedule.work_end_time}`);
            console.log(`📊 Confidence: ${schedule.confidence_score}`);
        }

        // Obtener todos los viajes
        const { data: trips, error } = await supabase
            .from('tripsimg')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            console.error("❌ Error fetching trips:", error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`📊 Found ${trips?.length || 0} trips`);

        // Destinos válidos
        const officeLocation = 'Mireka Tower';
        const homeLocation = '43b Lauries Rd';

        // Validar viajes
        const validTrips = [];
        const invalidTrips = [];
        const pendingTrips = [];

        trips.forEach(trip => {
            const validation = validateTrip(trip, schedule, officeLocation, homeLocation);

            if (validation.status === 'valid') {
                validTrips.push({ ...trip, validation_reason: validation.reason });
            } else if (validation.status === 'invalid') {
                invalidTrips.push({ ...trip, validation_reason: validation.reason });
            } else {
                pendingTrips.push({ ...trip, validation_reason: validation.reason });
            }
        });

        // Calcular total de viajes válidos
        const totalValid = validTrips.reduce((sum, trip) => {
            const amount = parseFloat(trip.amount?.replace(/[^0-9.]/g, '') || 0);
            return sum + amount;
        }, 0);

        console.log(`✅ Valid trips: ${validTrips.length}`);
        console.log(`❌ Invalid trips: ${invalidTrips.length}`);
        console.log(`⏳ Pending trips: ${pendingTrips.length}`);
        console.log(`💰 Total valid: LKR ${totalValid.toFixed(2)}`);

        return res.status(200).json({
            valid: validTrips,
            invalid: invalidTrips,
            pending: pendingTrips,
            totalValid: totalValid.toFixed(2),
            schedule: schedule ? {
                workStartTime: schedule.work_start_time,
                workEndTime: schedule.work_end_time,
                workDays: schedule.work_days,
                confidence: schedule.confidence_score,
            } : null,
            summary: {
                totalTrips: trips.length,
                validCount: validTrips.length,
                invalidCount: invalidTrips.length,
                pendingCount: pendingTrips.length,
            }
        });

    } catch (err) {
        console.error("💥 Server error:", err);
        return res.status(500).json({
            error: err.message,
            stack: err.stack,
        });
    }
}

// Función de validación de viaje
function validateTrip(trip, schedule, officeLocation, homeLocation) {
    // 1. Validación de monto (150-600 LKR)
    const amountStr = trip.amount?.replace(/[^0-9.]/g, '') || '0';
    const amount = parseFloat(amountStr);

    if (amount < 150 || amount > 600) {
        return { status: 'invalid', reason: `Amount out of range: LKR ${amount.toFixed(2)}` };
    }

    // 2. Validación de ubicación
    const isOfficeTrip = trip.location && trip.location.includes(officeLocation);
    const isHomeTrip = trip.location && trip.location.includes(homeLocation);

    if (!isOfficeTrip && !isHomeTrip) {
        return { status: 'invalid', reason: 'Invalid location' };
    }

    // 3. Si no hay horario inferido, marcar como pendiente
    if (!schedule) {
        return { status: 'pending', reason: 'No schedule inferred yet' };
    }

    // 4. Si la confianza es baja, marcar como pendiente
    if (schedule.confidence_score < 0.60) {
        return { status: 'pending', reason: 'Low confidence in schedule' };
    }

    // 5. Validar horario
    if (!trip.time) {
        return { status: 'pending', reason: 'Missing time information' };
    }

    const tripMinutes = parseTimeToMinutes(trip.time);
    if (tripMinutes === null) {
        return { status: 'pending', reason: 'Invalid time format' };
    }

    const startMinutes = timeToMinutes(schedule.work_start_time);
    const endMinutes = timeToMinutes(schedule.work_end_time);

    // Validar viaje a oficina (40 min antes de entrada)
    if (isOfficeTrip) {
        const windowStart = startMinutes - 40;
        const windowEnd = startMinutes;

        if (tripMinutes >= windowStart && tripMinutes <= windowEnd) {
            return { status: 'valid', reason: 'Valid morning commute' };
        } else {
            return { status: 'invalid', reason: `Outside morning window (${minutesToTimeStr(windowStart)} - ${minutesToTimeStr(windowEnd)})` };
        }
    }

    // Validar viaje a casa (50 min después de salida)
    if (isHomeTrip) {
        const windowStart = endMinutes;
        const windowEnd = endMinutes + 50;

        if (tripMinutes >= windowStart && tripMinutes <= windowEnd) {
            return { status: 'valid', reason: 'Valid evening commute' };
        } else {
            return { status: 'invalid', reason: `Outside evening window (${minutesToTimeStr(windowStart)} - ${minutesToTimeStr(windowEnd)})` };
        }
    }

    return { status: 'pending', reason: 'Unknown validation error' };
}

// Helper: Parsear hora "HH:MM AM/PM" a minutos
function parseTimeToMinutes(timeStr) {
    try {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return null;

        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const period = match[3].toUpperCase();

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return hours * 60 + minutes;
    } catch (e) {
        return null;
    }
}

// Helper: Convertir "HH:MM:SS" a minutos
function timeToMinutes(timeStr) {
    const [hours, mins] = timeStr.split(':').map(Number);
    return hours * 60 + mins;
}

// Helper: Convertir minutos a "HH:MM AM/PM"
function minutesToTimeStr(minutes) {
    let hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';

    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;

    return `${hours}:${String(mins).padStart(2, '0')} ${period}`;
}
