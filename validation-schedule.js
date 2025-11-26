/**
 * Schedule-based validation module
 * Provides secondary validation layer based on work schedule
 */

/**
 * Convert time string to minutes since midnight
 * @param {string} timeStr - "11:38 AM" or "23:45"
 * @returns {number|null} - Minutes since midnight
 */
export function timeToMinutes(timeStr) {
    if (!timeStr) return null;

    // Handle 12-hour format (11:38 AM, 11:38 PM)
    const match12h = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match12h) {
        let hours = parseInt(match12h[1], 10);
        const minutes = parseInt(match12h[2], 10);
        const period = match12h[3].toUpperCase();

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return hours * 60 + minutes;
    }

    // Handle 24-hour format (23:45)
    const match24h = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match24h) {
        const hours = parseInt(match24h[1], 10);
        const minutes = parseInt(match24h[2], 10);
        return hours * 60 + minutes;
    }

    return null;
}

/**
 * Format minutes to HH:MM string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} - Formatted time "HH:MM"
 */
function formatMinutes(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Validate trip based on work schedule
 * @param {string} tripTime - "11:38 AM"
 * @param {string} direction - "home-to-office" or "office-to-home"
 * @param {number} startHour - Work start hour (24h format)
 * @param {number} endHour - Work end hour (24h format)
 * @returns {object} - {isValid, reason}
 */
export function validateTripBySchedule(tripTime, direction, startHour, endHour) {
    const tripMinutes = timeToMinutes(tripTime);

    if (tripMinutes === null) {
        return { isValid: true, reason: 'No time available for validation' };
    }

    const startMinutes = startHour * 60;
    const endMinutes = endHour * 60;

    if (direction === 'home-to-office') {
        // Valid window: 40 minutes before start to start time
        const windowStart = startMinutes - 40;
        const windowEnd = startMinutes;

        if (tripMinutes >= windowStart && tripMinutes <= windowEnd) {
            return { isValid: true, reason: 'Within office arrival window' };
        } else {
            return {
                isValid: false,
                reason: `Outside office window (${formatMinutes(windowStart)} - ${formatMinutes(windowEnd)})`
            };
        }
    }

    if (direction === 'office-to-home') {
        // Valid window: from end time to 50 minutes after
        const windowStart = endMinutes;
        const windowEnd = endMinutes + 50;

        // Handle midnight crossover (e.g., work ends at 23:00, valid until 23:50)
        let adjustedTripMinutes = tripMinutes;
        if (windowEnd >= 1440 && tripMinutes < 180) {
            // If window crosses midnight and trip is in early morning (before 3 AM)
            adjustedTripMinutes += 1440;
        }

        if (adjustedTripMinutes >= windowStart && adjustedTripMinutes <= windowEnd) {
            return { isValid: true, reason: 'Within home departure window' };
        } else {
            return {
                isValid: false,
                reason: `Outside home window (${formatMinutes(windowStart)} - ${formatMinutes(windowEnd)})`
            };
        }
    }

    return { isValid: true, reason: 'No direction specified' };
}
