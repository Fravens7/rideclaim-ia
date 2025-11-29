// --- API para obtener viajes validados ---
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
        const validLocations = ['43b Lauries Rd', 'Mireka Tower'];

        // Validar viajes
        const validTrips = [];
        const invalidTrips = [];

        trips.forEach(trip => {
            const isValid = validLocations.includes(trip.location);

            if (isValid) {
                validTrips.push(trip);
            } else {
                invalidTrips.push(trip);
            }
        });

        // Calcular total de viajes válidos
        const totalValid = validTrips.reduce((sum, trip) => {
            // Extraer solo los números del amount (ej: "LKR274.00" -> 274.00)
            const amount = parseFloat(trip.amount?.replace(/[^0-9.]/g, '') || 0);
            return sum + amount;
        }, 0);

        console.log(`✅ Valid trips: ${validTrips.length}`);
        console.log(`❌ Invalid trips: ${invalidTrips.length}`);
        console.log(`💰 Total valid: LKR ${totalValid.toFixed(2)}`);

        return res.status(200).json({
            valid: validTrips,
            invalid: invalidTrips,
            totalValid: totalValid.toFixed(2),
            summary: {
                totalTrips: trips.length,
                validCount: validTrips.length,
                invalidCount: invalidTrips.length,
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
