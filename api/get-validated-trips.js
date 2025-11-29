import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        const { batchId } = req.query;
        if (!batchId) return res.status(400).json({ error: "Missing batchId" });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        // 1. Fetch Raw Trips
        const { data: rawTrips, error } = await supabase
            .from('tripsimg')
            .select('*')
            .eq('batch_id', batchId);

        if (error || !rawTrips) return res.status(500).json({ error: "DB Error" });

        // --- INTELLIGENT VALIDATION LOGIC ---

        const VALID_YEAR = "2025";
        const VALID_MONTH = "Nov";
        
        // Step 1: Pre-Classification (Hard Filters)
        // We separate trips into "Candidates for Schedule" and "Garbage"
        let officeCandidates = [];
        let homeCandidates = [];
        let rejectedTrips = [];

        rawTrips.forEach(trip => {
            const reason = checkHardRules(trip);
            if (reason) {
                // Failed Hard Rules (Date, Location, Price)
                rejectedTrips.push({ ...trip, status: 'invalid', reason });
            } else {
                // Passed Hard Rules -> This is a candidate for schedule calculation
                if (isLocation(trip.location, 'office')) {
                    officeCandidates.push(trip);
                } else if (isLocation(trip.location, 'home')) {
                    homeCandidates.push(trip);
                }
            }
        });

        // Step 2: Infer Schedule (The "Magic")
        // We only use the valid candidates to calculate the time
        const workStartTime = calculateMedianTime(officeCandidates);
        const workEndTime = calculateMedianTime(homeCandidates);

        const scheduleText = (workStartTime && workEndTime) 
            ? `${minutesToTime(workStartTime)} - ${minutesToTime(workEndTime)}` 
            : "Insufficient Data";

        // Step 3: Final Time Validation
        // Now we check the "Candidates" against the calculated schedule
        const validTrips = [];
        
        // Validate Office Trips
        officeCandidates.forEach(trip => {
            if (validateTimeWindow(trip.time, workStartTime, -40, 30)) { // 40m before, 30m after
                validTrips.push({ ...trip, status: 'valid', reason: 'Valid Morning Commute' });
            } else {
                rejectedTrips.push({ ...trip, status: 'invalid', reason: `Time mismatch (Exp: ${minutesToTime(workStartTime)})` });
            }
        });

        // Validate Home Trips
        homeCandidates.forEach(trip => {
            if (validateTimeWindow(trip.time, workEndTime, -30, 240)) { // 30m before, 4h after
                validTrips.push({ ...trip, status: 'valid', reason: 'Valid Evening Commute' });
            } else {
                rejectedTrips.push({ ...trip, status: 'invalid', reason: `Time mismatch (Exp: ${minutesToTime(workEndTime)})` });
            }
        });

        // Calculate Totals
        const totalAmount = validTrips.reduce((sum, t) => sum + parseAmount(t.amount), 0);

        return res.status(200).json({
            trips: {
                valid: validTrips,
                invalid: rejectedTrips
            },
            summary: {
                valid: validTrips.length,
                invalid: rejectedTrips.length
            },
            totalValid: totalAmount.toFixed(2),
            inferredSchedule: scheduleText
        });

    } catch (err) {
        console.error("Critical Error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// --- HELPER FUNCTIONS ---

function checkHardRules(trip) {
    // 1. Date Check
    if (!trip.date || !trip.date.includes('Nov')) return "Date not in Nov 2025";
    
    // 2. Price Check
    const amount = parseAmount(trip.amount);
    if (amount < 150 || amount > 600) return `Amount out of range (${amount})`;

    // 3. Location Check
    const isOffice = isLocation(trip.location, 'office');
    const isHome = isLocation(trip.location, 'home');
    if (!isOffice && !isHome) return "Invalid Location";

    return null; // Passed
}

function isLocation(text, type) {
    if (!text) return false;
    if (type === 'office') return /Mireka/i.test(text);
    if (type === 'home') return /Lauries/i.test(text);
    return false;
}

function validateTimeWindow(tripTimeStr, anchorMinutes, toleranceBefore, toleranceAfter) {
    if (!anchorMinutes) return true; // If no schedule inferred, we might accept it (or fail it, depending on strictness. Here stricter is better: fail if no schedule)
    
    const tripMins = parseTime(tripTimeStr);
    if (tripMins === null) return false;

    const min = anchorMinutes + toleranceBefore;
    const max = anchorMinutes + toleranceAfter;
    
    return tripMins >= min && tripMins <= max;
}

function calculateMedianTime(trips) {
    if (!trips || trips.length === 0) return null;
    const minutes = trips.map(t => parseTime(t.time)).filter(m => m !== null).sort((a,b) => a - b);
    if (minutes.length === 0) return null;
    
    const mid = Math.floor(minutes.length / 2);
    return minutes.length % 2 !== 0 
        ? minutes[mid] 
        : (minutes[mid - 1] + minutes[mid]) / 2;
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
