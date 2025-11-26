function updateTripCalendar() {
    // 1. Filtrar solo los PDFs válidos
    const validPdfTrips = fileResults.filter(result => result.type === 'pdf' && result.isValid);

    // 2. Agrupar los viajes por día
    const tripsByDay = {};
    validPdfTrips.forEach(trip => {
        const day = trip.tripDate;
        if (!tripsByDay[day]) {
            tripsByDay[day] = [];
        }
        tripsByDay[day].push({
            direction: trip.direction,
            time: trip.tripTime
        });
    });

    // 3. Generar el calendario HTML
    const calendarContainer = document.getElementById('tripCalendar');
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

    // 4. Crear el encabezado del calendario
    const calendarHeader = document.createElement('div');
    calendarHeader.className = 'calendar-header';

    const prevMonthBtn = document.createElement('button');
    prevMonthBtn.className = 'calendar-nav';
    prevMonthBtn.textContent = 'Previous';
    prevMonthBtn.onclick = () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        updateTripCalendar();
    };

    const monthYearLabel = document.createElement('h3');
    monthYearLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    monthYearLabel.style.textAlign = 'center';
    monthYearLabel.style.margin = '0';

    const nextMonthBtn = document.createElement('button');
    nextMonthBtn.className = 'calendar-nav';
    nextMonthBtn.textContent = 'Next';
    nextMonthBtn.onclick = () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        updateTripCalendar();
    };

    calendarHeader.appendChild(prevMonthBtn);
    calendarHeader.appendChild(monthYearLabel);
    calendarHeader.appendChild(nextMonthBtn);

    // 5. Crear la tabla del calendario
    const calendarTable = document.createElement('table');
    calendarTable.className = 'calendar-table';

    // 6. Crear el encabezado de la tabla (días de la semana)
    const tableHeader = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    weekDays.forEach(day => {
        const th = document.createElement('th');
        th.textContent = day;
        headerRow.appendChild(th);
    });

    tableHeader.appendChild(headerRow);
    calendarTable.appendChild(tableHeader);

    // 7. Crear el cuerpo de la tabla
    const tableBody = document.createElement('tbody');

    // 8. Obtener el primer día del mes y el número de días en el mes
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // 9. Crear las filas del calendario
    let date = 1;
    for (let i = 0; i < 6; i++) {
        const row = document.createElement('tr');

        for (let j = 0; j < 7; j++) {
            const cell = document.createElement('td');

            if (i === 0 && j < firstDay) {
                // Celdas vacías antes del primer día del mes
                cell.textContent = '';
            } else if (date > daysInMonth) {
                // Celdas vacías después del último día del mes
                cell.textContent = '';
            } else {
                // Celdas con fechas
                const dayNumber = document.createElement('div');
                dayNumber.className = 'day-number';
                dayNumber.textContent = date;
                cell.appendChild(dayNumber);

                // Obtener la fecha en formato "d mes" (ej. "1 nov")
                const monthAbbrev = monthNames[currentMonth].substring(0, 3).toLowerCase();
                const dayKey = `${date} ${monthAbbrev}`;

                // Verificar si hay viajes para este día
                if (tripsByDay[dayKey]) {
                    const trips = tripsByDay[dayKey];

                    // Crear indicadores para cada dirección
                    trips.forEach(trip => {
                        const indicator = document.createElement('div');
                        indicator.className = 'trip-indicator';

                        if (trip.direction === 'home-to-office') {
                            indicator.classList.add('home-to-office');
                        } else if (trip.direction === 'office-to-home') {
                            indicator.classList.add('office-to-home');
                        }

                        // Añadir tooltip con la hora del viaje
                        if (trip.time) {
                            indicator.addEventListener('mouseenter', (e) => {
                                let formattedTime = trip.time;
                                // Asegurarse de que la hora tenga formato am/pm si no lo tiene
                                if (!formattedTime.toLowerCase().includes('am') && !formattedTime.toLowerCase().includes('pm')) {
                                    // Si no tiene am/pm, asumimos que es formato 24h y lo convertimos
                                    const timeParts = formattedTime.split(':');
                                    if (timeParts.length === 2) {
                                        const hour = parseInt(timeParts[0]);
                                        const minute = timeParts[1];
                                        const period = hour >= 12 ? 'pm' : 'am';
                                        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                                        formattedTime = `${displayHour}:${minute}${period}`;
                                    }
                                }
                                tooltip.textContent = formattedTime;
                                tooltip.style.display = 'block';
                                tooltip.style.left = e.pageX + 10 + 'px';
                                tooltip.style.top = e.pageY - 30 + 'px';
                            });

                            indicator.addEventListener('mouseleave', () => {
                                tooltip.style.display = 'none';
                            });
                        }

                        cell.appendChild(indicator);
                    });
                } else {
                    // No hay viajes para este día
                    const indicator = document.createElement('div');
                    indicator.className = 'trip-indicator no-trip';
                    cell.appendChild(indicator);
                }

                date++;
            }

            row.appendChild(cell);
        }

        tableBody.appendChild(row);

        // Si ya hemos mostrado todos los días del mes, no necesitamos más filas
        if (date > daysInMonth) {
            break;
        }
    }

    calendarTable.appendChild(tableBody);

    // 10. Limpiar y actualizar el contenedor del calendario
    calendarContainer.innerHTML = '';
    calendarContainer.appendChild(calendarHeader);
    calendarContainer.appendChild(calendarTable);
}

/**
 * --- NUEVA FUNCIÓN: REVALIDAR VIAJES CON HORARIO ---
 * Recorre todos los resultados y verifica si la hora del viaje coincide con el horario laboral.
 */
function revalidateTripsWithSchedule(startTimeStr, endTimeStr) {
    const startMinutes = timeToMinutes(startTimeStr);
    const endMinutes = timeToMinutes(endTimeStr);

    if (startMinutes === null || endMinutes === null) return;

    let revalidatedCount = 0;

    fileResults.forEach(result => {
        // Solo revalidamos si el viaje ya era válido por otros criterios (destino, precio)
        // y si tenemos una hora de viaje extraída.
        if (result.isValid && result.tripTime) {
            const tripMinutes = timeToMinutes(result.tripTime);
            if (tripMinutes === null) return;

            let isTimeValid = true;
            let timeReason = "";
            const destinationLower = result.destination.toLowerCase();

            // REGLA 1: Viaje al TRABAJO (Mireka Tower)
            // Válido solo 60 minutos ANTES del inicio.
            if (destinationLower.includes("mireka tower")) {
                const validStartWindow = startMinutes - 60;
                const validEndWindow = startMinutes;

                if (tripMinutes < validStartWindow || tripMinutes > validEndWindow) {
                    isTimeValid = false;
                    timeReason = `Outside work start window (${startTimeStr} - 60min)`;
                }
            }
            // REGLA 2: Viaje a CASA (Lauries Rd)
            // Válido solo DESPUÉS del fin.
            else if (destinationLower.includes("lauries rd")) {
                const validStartWindow = endMinutes;
                const validEndWindow = endMinutes + 240; // 4 hours margin

                let adjustedTripMinutes = tripMinutes;
                if (validEndWindow >= 1440 && tripMinutes < 180) {
                    adjustedTripMinutes += 1440;
                }

                if (adjustedTripMinutes < validStartWindow || adjustedTripMinutes > validEndWindow) {
                    isTimeValid = false;
                    timeReason = `Before work end time (${endTimeStr})`;
                }
            }

            if (!isTimeValid) {
                console.warn(`⚠️ [TIME-VALIDATION] Invalidating trip to ${result.destination} at ${result.tripTime}. Reason: ${timeReason}`);
                result.isValid = false;
                result.validationDetails = (result.validationDetails || []) + ` | Invalid Time: ${timeReason}`;

                // Actualizar UI visualmente
                const fileItem = document.getElementById(`file-${result.type}-${result.name.replace(/\s/g, '-')}`);
                if (fileItem) {
                    fileItem.className = 'file-item invalid';
                    const fileStatus = fileItem.querySelector('.file-status');
                    if (fileStatus) {
                        fileStatus.className = 'file-status status-invalid';
                        fileStatus.textContent = 'Invalid Time';
                    }
                }
                revalidatedCount++;
            }
        }
    });

    if (revalidatedCount > 0) {
        console.log(`✅ [MAIN] Revalidated ${revalidatedCount} trips based on new schedule.`);
        updateResultsTable(); // Refrescar tabla si está visible
        // Recalcular resumen
        const validCount = fileResults.filter(r => r.isValid).length;
        const invalidCount = fileResults.length - validCount;
        const totalAmount = fileResults.filter(r => r.isValid).reduce((sum, r) => sum + parseFloat(r.total || 0), 0);
        updateSummaryCards(fileResults.length, validCount, invalidCount, totalAmount);
    }
}

function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    let [, hours, minutes, period] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);
    period = period.toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}
