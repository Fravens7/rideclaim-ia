import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        const { batchId } = req.query; // Recibir ID por URL
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        // 1. Obtener solo viajes de ESTE lote
        const { data: trips } = await supabase
            .from('tripsimg')
            .select('*')
            .eq('batch_id', batchId)
            .order('id', { ascending: true });

        if (!trips || trips.length === 0) {
            return res.json({ success: false, message: "No trips found in this batch" });
        }

        console.log(`🧠 Analyzing batch ${batchId} with ${trips.length} trips`);

        // --- LÓGICA HÍBRIDA ---
        
        let workStartTime, workEndTime, confidence;
        let methodUsed = "statistical";

        const officeTrips = trips.filter(t => t.location && t.location.includes('Mireka'));
        const homeTrips = trips.filter(t => t.location && t.location.includes('Lauries'));

        // Extracción de tiempos
        const officeTimes = officeTrips.map(t => parseTime(t.time)).filter(t => t !== null);
        const homeTimes = homeTrips.map(t => parseTime(t.time)).filter(t => t !== null);

        // ESTRATEGIA 1: Si hay suficientes datos (>4 de cada uno), usar Mediana (Tu lógica original)
        if (officeTimes.length >= 4 && homeTimes.length >= 4) {
            const avgOffice = calculateMedian(officeTimes);
            workStartTime = minutesToTime(avgOffice + 40); // +40 min buffer entrada
            workEndTime = minutesToTime(calculateMedian(homeTimes));
            confidence = 0.95;
        } 
        // ESTRATEGIA 2 (FALLBACK): Pocos datos -> Usar "Horario Estándar de Oficina"
        else {
            console.log("⚠️ Not enough data for precise AI inference. Using Default Standard Window.");
            methodUsed = "default_fallback";
            
            // Asumimos un horario estándar de 9 a 6 (ajustable) para permitir validación
            workStartTime = "09:00 AM"; 
            workEndTime = "06:00 PM";
            confidence = 0.50; // Confianza baja, pero permite validar
        }

        // 3. Guardar/Actualizar horario en DB
        const { error } = await supabase
            .from('employee_schedules')
            .upsert({
                batch_id: batchId, // Clave única
                work_start_time: workStartTime,
                work_end_time: workEndTime,
                work_days: [1,2,3,4,5], // Asumimos Lunes-Viernes por defecto
                confidence_score: confidence,
                total_trips_analyzed: trips.length,
                last_analyzed: new Date().toISOString()
            }, { onConflict: 'batch_id' });

        if (error) throw error;

        return res.json({
            success: true,
            schedule: { workStartTime, workEndTime, confidence, methodUsed }
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

// Helpers
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

function calculateMedian(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function minutesToTime(minutes) {
    let h = Math.floor(minutes / 60) % 24;
    let m = Math.floor(minutes % 60);
    const p = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2,'0')} ${p}`;
}
