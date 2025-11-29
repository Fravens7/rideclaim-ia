// --- API para inferir horario de trabajo automáticamente ---
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        console.log("🧠 Starting work schedule inference");

        if (req.method !== "GET" && req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: "Missing Supabase credentials" });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Obtener todos los viajes
        const { data: allTrips, error: tripsError } = await supabase
            .from('tripsimg')
            .select('*')
            .order('date', { ascending: true });

        if (tripsError) {
            console.error("❌ Error fetching trips:", tripsError);
            return res.status(500).json({ error: tripsError.message });
        }

        if (!allTrips || allTrips.length < 10) {
            return res.status(200).json({
                success: false,
                message: "Not enough data to infer schedule (minimum 10 trips required)",
                tripsCount: allTrips?.length || 0,
            });
        }

        console.log(`📊 Analyzing ${allTrips.length} trips`);

        // Filtrar viajes a oficina (Mireka Tower)
        const officeTrips = allTrips.filter(trip =>
            trip.location && trip.location.includes('Mireka Tower')
        );

        // Filtrar viajes a casa (43b Lauries Rd)
        const homeTrips = allTrips.filter(trip =>
            trip.location && trip.location.includes('43b Lauries Rd')
        );

        console.log(`🏢 Office trips: ${officeTrips.length}`);
        console.log(`🏠 Home trips: ${homeTrips.length}`);

        if (officeTrips.length < 5 || homeTrips.length < 5) {
            return res.status(200).json({
                success: false,
                message: "Not enough office/home trips to infer schedule",
                officeTrips: officeTrips.length,
                homeTrips: homeTrips.length,
            });
        }

        // Extraer horas de viajes a oficina
        const officeTimes = officeTrips
            .filter(trip => trip.time)
            .map(trip => parseTime(trip.time))
            .filter(time => time !== null);

        // Extraer horas de viajes a casa
        const homeTimes = homeTrips
            .filter(trip => trip.time)
            .map(trip => parseTime(trip.time))
            .filter(time => time !== null);

        if (officeTimes.length < 5 || homeTimes.length < 5) {
            return res.status(200).json({
                success: false,
                message: "Not enough valid time data",
            });
        }

        // Calcular hora promedio de entrada (viajes a oficina + 40 min)
        const avgOfficeTime = calculateMedianTime(officeTimes);
        const workStartTime = addMinutes(avgOfficeTime, 40);

        // Calcular hora promedio de salida (viajes a casa - 10 min)
        const avgHomeTime = calculateMedianTime(homeTimes);
        const workEndTime = addMinutes(avgHomeTime, -10);

        // Detectar días laborables (analizar por día de semana)
        const dayFrequency = analyzeDayFrequency(allTrips);
        const workDays = getTopWorkDays(dayFrequency, 5);

        // Calcular confianza del análisis
        const confidence = calculateConfidence(officeTrips.length, homeTrips.length, allTrips.length);

        console.log(`⏰ Inferred schedule: ${workStartTime} - ${workEndTime}`);
        console.log(`📅 Work days: ${workDays.join(', ')}`);
        console.log(`📊 Confidence: ${confidence}`);

        // Guardar en employee_schedules
        const { data: scheduleData, error: scheduleError } = await supabase
            .from('employee_schedules')
            .upsert({
                employee_id: 'default_employee',
                work_start_time: workStartTime,
                work_end_time: workEndTime,
                work_days: workDays,
                confidence_score: confidence,
                total_trips_analyzed: allTrips.length,
                last_analyzed: new Date().toISOString(),
            }, {
                onConflict: 'employee_id'
            });

        if (scheduleError) {
            console.error("❌ Error saving schedule:", scheduleError);
            return res.status(500).json({ error: scheduleError.message });
        }

        return res.status(200).json({
            success: true,
            schedule: {
                workStartTime,
                workEndTime,
                workDays,
                confidence,
                tripsAnalyzed: allTrips.length,
                officeTrips: officeTrips.length,
                homeTrips: homeTrips.length,
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

// Helper: Parsear hora en formato "HH:MM AM/PM" a minutos desde medianoche
function parseTime(timeStr) {
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

// Helper: Calcular mediana de tiempos
function calculateMedianTime(times) {
    const sorted = times.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMinutes = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    return minutesToTime(Math.round(medianMinutes));
}

// Helper: Convertir minutos a formato HH:MM:SS
function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}

// Helper: Agregar minutos a un tiempo
function addMinutes(timeStr, minutesToAdd) {
    const [hours, mins] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutesToAdd;
    return minutesToTime(totalMinutes);
}

// Helper: Analizar frecuencia por día de semana
function analyzeDayFrequency(trips) {
    const frequency = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    trips.forEach(trip => {
        if (trip.date) {
            // Parsear fecha (asumiendo formato "Nov 24")
            const dayOfWeek = parseDateToDayOfWeek(trip.date);
            if (dayOfWeek !== null) {
                frequency[dayOfWeek]++;
            }
        }
    });

    return frequency;
}

// Helper: Parsear fecha a día de semana
function parseDateToDayOfWeek(dateStr) {
    try {
        // Esto es simplificado - en producción necesitarías el año
        const currentYear = new Date().getFullYear();
        const date = new Date(`${dateStr} ${currentYear}`);
        return date.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    } catch (e) {
        return null;
    }
}

// Helper: Obtener los N días con más viajes
function getTopWorkDays(frequency, topN) {
    const sorted = Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([day]) => parseInt(day));

    return sorted.sort((a, b) => a - b);
}

// Helper: Calcular confianza del análisis
function calculateConfidence(officeTrips, homeTrips, totalTrips) {
    const minTrips = Math.min(officeTrips, homeTrips);

    if (minTrips >= 20) return 0.95;
    if (minTrips >= 15) return 0.85;
    if (minTrips >= 10) return 0.75;
    if (minTrips >= 5) return 0.60;
    return 0.40;
}
