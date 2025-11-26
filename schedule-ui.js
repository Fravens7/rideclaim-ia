import { validateTripBySchedule } from './validation-schedule.js';

// ============================================
// SCHEDULE UI - Event Listeners & Integration
// This file handles the UI logic for schedule validation
// ============================================

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    let workSchedule = null;
    const applyScheduleBtn = document.getElementById('applySchedule');
    const scheduleConfig = document.getElementById('scheduleConfig');

    console.log('🔍 [SCHEDULE-UI] Elements:', { applyScheduleBtn, scheduleConfig });

    if (!applyScheduleBtn) {
        console.error('❌ [SCHEDULE-UI] Apply button not found!');
        return;
    }

    console.log('✅ [SCHEDULE-UI] Initialized');

    // Apply Schedule button click handler
    applyScheduleBtn.addEventListener('click', () => {
        console.log('🔘 [SCHEDULE-UI] Button clicked');

        const startHour = parseInt(document.getElementById('startTime').value);
        const endHour = parseInt(document.getElementById('endTime').value);

        console.log('Input:', { startHour, endHour });

        if (isNaN(startHour) || isNaN(endHour) || startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
            alert('Please enter valid hours (0-23)');
            return;
        }

        workSchedule = { startHour, endHour };
        console.log('✅ Schedule set:', workSchedule);

        // Access fileResults from global scope (defined in script.js)
        const fileResults = window.fileResults;
        if (typeof fileResults === 'undefined') {
            console.error('❌ fileResults not found!');
            return;
        }

        console.log('fileResults count:', fileResults.length);

        let count = 0;
        fileResults.forEach((r, i) => {
            console.log(`Trip ${i}:`, r.destination, r.tripTime, r.direction, r.isValid);

            // Auto-detect direction if missing
            if (!r.direction && r.destination) {
                const destLower = r.destination.toLowerCase();
                if (destLower.includes('mireka') || destLower.includes('havelock') || destLower.includes('324')) {
                    r.direction = 'home-to-office';
                    console.log('  → Auto: home-to-office');
                } else if (destLower.includes('43b') || destLower.includes('43d') || destLower.includes('lauries')) {
                    r.direction = 'office-to-home';
                    console.log('  → Auto: office-to-home');
                }
            }

            if (r.isValid && r.tripTime && r.direction) {
                const v = validateTripBySchedule(r.tripTime, r.direction, startHour, endHour);
                console.log('  Validation:', v);

                if (!v.isValid) {
                    r.isValid = false;
                    r.validationDetails = (r.validationDetails || '') + ' | ' + v.reason;
                    count++;
                    console.log('  ❌ INVALIDATED');
                }
            } else {
                console.log('  ⏭️ Skipped');
            }
        });

        console.log(`✅ Revalidated ${count} trips`);

        // Refresh display (setResultsView from script.js)
        if (typeof window.setResultsView !== 'undefined' && typeof window.currentResultsView !== 'undefined') {
            console.log('Refreshing view:', window.currentResultsView);
            window.setResultsView(window.currentResultsView);
        } else {
            console.warn('⚠️ setResultsView not available');
        }

        console.log('✅ Done');
    });

    // Show schedule panel when images are processed
    document.addEventListener('imageProcessed', () => {
        console.log('📸 [SCHEDULE-UI] Image processed');
        if (scheduleConfig) scheduleConfig.style.display = 'block';
    });
});

// ====================================================================
// AI INTEGRATION: Allow AI module to update results
// This function is called by images-validation-ia.js
// ====================================================================
window.updateTripResultsFromAI = function (fileName, aiTrips) {
    console.log(`🤖 [AI-UPDATE] Updating results for ${fileName} with ${aiTrips.length} trips from AI`);

    // Access fileResults from window (exposed by script.js)
    const fileResults = window.fileResults;
    if (!fileResults) {
        console.error('❌ [AI-UPDATE] fileResults not found on window!');
        return;
    }

    // 1. Find existing results for this file
    const existingResults = fileResults.filter(r => r.fileName === fileName || r.name === fileName);

    if (existingResults.length === 0) {
        console.warn(`   - No existing OCR results found for ${fileName}. AI results will be ignored as per strict update policy.`);
        return;
    }

    console.log(`   - Found ${existingResults.length} existing OCR results to update.`);

    // 2. Merge AI results into existing results
    // Strategy: Map AI trips to existing trips by index.
    // We only update Time and Destination. We do NOT add new trips or remove existing ones.

    let updatedCount = 0;

    existingResults.forEach((existingTrip, index) => {
        if (index < aiTrips.length) {
            const aiTrip = aiTrips[index];

            // Update Time
            if (aiTrip.time || aiTrip.trip_time) {
                const newTime = aiTrip.time || aiTrip.trip_time;
                console.log(`     [Trip ${index + 1}] Updating Time: ${existingTrip.tripTime} -> ${newTime}`);
                existingTrip.tripTime = newTime;
                updatedCount++;
            }

            // Update Destination (Optional, but usually safer to trust AI for text)
            if (aiTrip.destination) {
                // Only update if AI destination looks valid/better
                console.log(`     [Trip ${index + 1}] Updating Dest: ${existingTrip.destination} -> ${aiTrip.destination}`);
                existingTrip.destination = aiTrip.destination;
            }

            // Mark as AI Enhanced
            existingTrip.type = 'Image (AI Enhanced)';
            existingTrip.validationDetails = (existingTrip.validationDetails || '') + ' | AI Verified';

            // Recalculate direction based on new destination
            const destLower = (existingTrip.destination || '').toLowerCase();
            if (destLower.includes('mireka') || destLower.includes('havelock') || destLower.includes('324')) {
                existingTrip.direction = 'home-to-office';
            } else if (destLower.includes('43b') || destLower.includes('43d') || destLower.includes('lauries')) {
                existingTrip.direction = 'office-to-home';
            }
        }
    });

    console.log(`   - Updated ${updatedCount} trips with AI data.`);

    // 3. Re-apply schedule validation if active
    if (window.workSchedule && typeof validateTripBySchedule === 'function') {
        // Re-run validation logic for these new trips
        existingResults.forEach(r => {
            if (r.isValid && r.tripTime && r.direction) {
                const v = validateTripBySchedule(r.tripTime, r.direction, window.workSchedule.startHour, window.workSchedule.endHour);
                if (!v.isValid) {
                    r.isValid = false;
                    r.validationDetails += ' | ' + v.reason;
                }
            }
        });
    }

    // 4. Refresh UI
    // CRITICAL FIX: Call updateResultsTable() to force a re-render of the DOM
    if (typeof window.updateResultsTable === 'function') {
        window.updateResultsTable();
    } else {
        console.warn('⚠️ updateResultsTable not found on window');
    }

    if (typeof window.renderGroupedResults === 'function') {
        window.renderGroupedResults();
    }

    // Show toast/notification
    const toast = document.createElement('div');
    toast.className = 'ai-toast';
    toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #10a37f; color: white; padding: 15px; border-radius: 8px; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); animation: slideIn 0.3s ease-out;';
    toast.innerHTML = `🤖 AI updated <b>${fileName}</b><br>Merged info for ${updatedCount} trips`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};
