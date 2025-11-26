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
        if (typeof setResultsView !== 'undefined' && typeof currentResultsView !== 'undefined') {
            console.log('Refreshing view:', currentResultsView);
            setResultsView(currentResultsView);
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
