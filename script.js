// Al principio de script.js
import { processImageWithAI } from './images-validation-ia.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const staticLocations = {
    home: { lat: 6.89535, lng: 79.85766 }, office: { lat: 6.882986650923001, lng: 79.86809890134177 }
};

const zoneKeywords = {
    home: ['43b', '43d', 'lauries'],
    office: ['mireka', 'havelock', '324']
};

function findZone(addressText) {
    if (!addressText) return null;
    const lowerCaseText = addressText.toLowerCase();

    for (const zoneName in zoneKeywords) {
        const keywords = zoneKeywords[zoneName];
        const isThisZone = keywords.some(keyword => lowerCaseText.includes(keyword));
        if (isThisZone) {
            return zoneName; // Devuelve 'home' o 'office'
        }
    }

    return null; // No se encontró ninguna zona coincidente
}

// Inicialización de variables y elementos DOM
const pdfTab = document.getElementById('pdf-tab');
const imageTab = document.getElementById('image-tab');
const pdfContent = document.getElementById('pdf-content');
const imageContent = document.getElementById('image-content');
const pdfUploadArea = document.getElementById('pdfUploadArea');
const imageUploadArea = document.getElementById('imageUploadArea');
const pdfFiles = document.getElementById('pdfFiles');
const imageFiles = document.getElementById('imageFiles');
const pdfFileList = document.getElementById('pdfFileList');
const imageFileList = document.getElementById('imageFileList');
const resultsContainer = document.getElementById('resultsContainer');
const groupedResults = document.getElementById('groupedResults');
const tableResultsWrapper = document.getElementById('tableResults');
const resultsBody = document.getElementById('resultsBody');
const summary = document.getElementById('summary');
const clearBtn = document.getElementById('clearBtn');
const mapContainer = document.getElementById('map-container');
const modal = document.getElementById('detailsModal');
const modalExtractedText = document.getElementById('modalExtractedText');
const closeBtn = document.querySelector('#detailsModal .close');
const apiStatus = document.getElementById('apiStatus');
const tooltip = document.getElementById('tooltip');
const groupedViewBtn = document.getElementById('groupedViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const summaryTotalSpent = document.getElementById('summaryTotalSpent');
const summaryTotalRides = document.getElementById('summaryTotalRides');
const summaryActiveDays = document.getElementById('summaryActiveDays');
const summaryImages = document.getElementById('summaryImages');

let fileResults = [];
let map = null;
let processedPdfNames = new Set(); //memory for pdf
let processedImageNames = new Set(); //memory for png or images
let currentResultsView = 'grouped';

setResultsView('grouped');
updateSummaryCards(0, 0, 0, 0);

// Event Listeners
pdfTab.addEventListener('click', () => {
    pdfTab.classList.add('active');
    imageTab.classList.remove('active');
    pdfContent.classList.add('active');
    imageContent.classList.remove('active');
});

imageTab.addEventListener('click', () => {
    imageTab.classList.add('active');
    pdfTab.classList.remove('active');
    imageContent.classList.add('active');
    pdfContent.classList.remove('active');
});

pdfFiles.addEventListener('change', handlePdfFileSelect);
pdfUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    pdfUploadArea.classList.add('dragover');
});
pdfUploadArea.addEventListener('dragleave', () => {
    pdfUploadArea.classList.remove('dragover');
});
pdfUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    pdfUploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) handlePdfFiles(e.dataTransfer.files);
});

imageFiles.addEventListener('change', handleImageFileSelect);
imageUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadArea.classList.add('dragover');
});
imageUploadArea.addEventListener('dragleave', () => {
    imageUploadArea.classList.remove('dragover');
});
imageUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleImageFiles(e.dataTransfer.files);
});

if (groupedViewBtn && tableViewBtn) {
    groupedViewBtn.addEventListener('click', () => setResultsView('grouped'));
    tableViewBtn.addEventListener('click', () => setResultsView('table'));
}

closeBtn.onclick = () => modal.style.display = 'none';
window.onclick = (event) => {
    if (event.target == modal) modal.style.display = 'none';
};

clearBtn.addEventListener('click', () => {
    fileResults = [];
    pdfFileList.innerHTML = '';
    pdfFileList.style.display = 'none';
    imageFileList.innerHTML = '';
    imageFileList.style.display = 'none';
    resultsContainer.style.display = 'none';
    resultsBody.innerHTML = '';
    summary.innerHTML = '';
    mapContainer.innerHTML = '';
    if (map) {
        map.remove();
        map = null;
    }

    apiStatus.style.display = 'none';
    processedPdfNames.clear();
    processedImageNames.clear();
    if (groupedResults) groupedResults.innerHTML = '';
    updateSummaryCards(0, 0, 0, 0);
    setResultsView('grouped');
});

document.addEventListener('scheduleUpdated', (e) => {
    const { startTime, endTime } = e.detail;
    console.log(`🔔 [MAIN] Schedule update received: ${startTime} - ${endTime}`);
    revalidateTripsWithSchedule(startTime, endTime);
});

function handlePdfFiles(files) {
    const pdfFilesArr = Array.from(files).filter(file => file.type === 'application/pdf');
    if (pdfFilesArr.length === 0) {
        alert('Please select at least one valid PDF file.');
        return;
    }
    pdfFileList.style.display = 'block';
    pdfFileList.innerHTML = '';

    pdfFilesArr.forEach(file => {
        if (processedPdfNames.has(file.name)) {
            const duplicateItem = createDuplicateFileItem(file, 'pdf');
            pdfFileList.appendChild(duplicateItem);
            return;
        }

        processedPdfNames.add(file.name);

        const fileItem = createFileItem(file, 'pdf');
        pdfFileList.appendChild(fileItem);
        processPdfFile(file, fileItem);
    });
}

function createDuplicateFileItem(file, type) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item invalid';
    fileItem.id = `file-${type}-${file.name.replace(/\s/g, '-')}`;

    const fileHeader = document.createElement('div');
    fileHeader.className = 'file-header';

    const fileName = document.createElement('div');
    fileName.className = 'file-name';
    fileName.textContent = file.name;

    const fileStatus = document.createElement('div');
    fileStatus.className = 'file-status status-invalid';
    fileStatus.textContent = 'Duplicate file ignored';

    fileHeader.appendChild(fileName);
    fileHeader.appendChild(fileStatus);
    fileItem.appendChild(fileHeader);

    return fileItem;
}

function processPdfFile(file, fileItem) {
    const fileReader = new FileReader();
    fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);
        pdfjsLib.getDocument(typedarray).promise.then(function (pdf) {
            let totalPages = pdf.numPages;
            let fullText = '';
            let pagePromises = [];
            for (let i = 1; i <= totalPages; i++) {
                pagePromises.push(pdf.getPage(i).then(function (page) {
                    return page.getTextContent().then(function (textContent) {
                        let pageText = '';
                        textContent.items.forEach(function (item) {
                            pageText += item.str + ' ';
                        });
                        return pageText;
                    });
                }));
            }
            Promise.all(pagePromises).then(function (pageTexts) {
                pageTexts.forEach(function (text) {
                    fullText += text + '\n';
                });
                const tripInfo = extractTripInfoFromPdf(fullText);
                processExtractedText(file, fileItem, fullText, 'pdf', tripInfo);
            });
        }).catch(function (error) {
            console.error('Error processing PDF:', error);
            fileItem.className = 'file-item error';
            const fileStatus = fileItem.querySelector('.file-status');
            fileStatus.className = 'file-status status-error';
            fileStatus.textContent = 'Error processing';
            mapContainer.style.display = 'none';
        });
    };
    fileReader.readAsArrayBuffer(file);
}

function extractTripInfoFromPdf(text) {
    let origin = null;
    let destination = null;
    let tripTime = null;

    const timePattern = /(\d{1,2}:\d{2})\s+([a-zA-Z0-9\s,]+Sri Lanka)/g;
    let match;
    const addresses = [];
    while ((match = timePattern.exec(text)) !== null) {
        addresses.push({ time: match[1], address: match[2].trim() });
    }

    if (addresses.length >= 2) {
        origin = addresses[0].address;
        destination = addresses[1].address;
        tripTime = addresses[0].time;
    } else {
        const addressPattern = /([a-zA-Z0-9\s,]+Sri Lanka)/g;
        const allAddresses = [];
        while ((match = addressPattern.exec(text)) !== null) {
            allAddresses.push(match[1].trim());
        }
        if (allAddresses.length >= 2) {
            origin = allAddresses[0];
            destination = allAddresses[1];
        }
    }
    return { origin, destination, tripTime };
}

// --- LÓGICA IMAGEN (MODIFICADA) ---
function handleImageFileSelect(e) {
    if (e.target.files.length) handleImageFiles(e.target.files);
}

//supuestamente falta esto
function handlePdfFileSelect(e) {
    if (e.target.files.length) handlePdfFiles(e.target.files);
}





function handleImageFiles(files) {
    const imageFilesArr = Array.from(files).filter(file => /image\/(png|jpeg|jpg)/.test(file.type));
    if (imageFilesArr.length === 0) {
        alert('Please select at least one valid image file (PNG, JPG).');
        return;
    }
    imageFileList.style.display = 'block';
    imageFileList.innerHTML = '';

    imageFilesArr.forEach(file => {
        if (processedImageNames.has(file.name)) {
            const duplicateItem = createDuplicateFileItem(file, 'image');
            imageFileList.appendChild(duplicateItem);
            return;
        }

        processedImageNames.add(file.name);

        const fileItem = createFileItem(file, 'image');
        imageFileList.appendChild(fileItem);

        // --- NUEVO: PASAMOS EL OBJETO FILE COMPLETO A processImageFile ---
        processImageFile(file, fileItem);
    });
}





// Modificación en processImageFile para mejorar la asignación de fechas/horas
// --- VERSIÓN CORREGIDA Y SIMPLIFICADA DE processImageFile ---
function processImageFile(file, fileItem) {
    const fileReader = new FileReader();
    fileReader.onload = function (e) {
        // --- CORRECCIÓN: Declaramos imageDataURL en el ámbito correcto ---
        const imageDataURL = e.target.result; // Ahora está disponible para img.onload

        const img = new Image();
        img.onload = async function () { // <-- Hacemos la función async
            const processedImgSrc = preprocessImage(img);

            const progressBar = fileItem.querySelector('.progress');
            const fileStatus = fileItem.querySelector('.file-status');

            try {
                // --- PASO 1: Realizar el OCR con Tesseract.js (tu lógica existente) ---
                const { data: { text } } = await Tesseract.recognize(processedImgSrc, 'eng', {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const progress = Math.round(m.progress * 100);
                            progressBar.style.width = `${progress}%`;
                            fileStatus.textContent = `Processing... ${progress}%`;
                        }
                    }
                });

                //console.log("Raw OCR Text:", text);

                // --- MODIFICADO: Publicamos el evento con el imageDataURL ---
                console.log(`📢 [MAIN] Dispatching 'imageProcessed' event for ${file.name}`);
                document.dispatchEvent(new CustomEvent('imageProcessed', {
                    detail: {
                        fileName: file.name, // Pasamos el nombre por separado
                        ocrText: text,
                        imageDataURL: imageDataURL // <-- PASAMOS EL DATAURL
                    }
                }));

                // --- PASO 3: CONTINUAR CON TU LÓGICA PRINCIPAL (sin cambios) ---
                apiStatus.style.display = 'block';
                apiStatus.className = 'api-status processing';
                apiStatus.textContent = 'Processing with AI...';

                const trips = await extractTripsWithLLM(text);
                console.log("Structured Data:", trips);

                // Ocultar estado de procesamiento
                apiStatus.style.display = 'none';

                const fileDetails = document.createElement('div');
                fileDetails.className = 'file-details';
                fileDetails.textContent = `${trips.length} trip(s) found.`;
                fileItem.appendChild(fileDetails);

                let validTripsFound = 0;
                trips.forEach((trip) => {
                    const validationResult = validateTrip(trip, 'image');
                    if (validationResult.isValid) validTripsFound++;

                    fileResults.push({
                        name: file.name,
                        type: 'image',
                        total: trip.total_lkr,
                        origin: trip.origin || 'Not specified',
                        destination: trip.destination,
                        isValid: validationResult.isValid,
                        validationDetails: validationResult.details,
                        text: text,
                        tripTime: trip.trip_time || null
                    });
                });

                fileItem.className = validTripsFound > 0 ? 'file-item success' : 'file-item invalid';
                fileStatus.className = `file-status ${validTripsFound > 0 ? 'status-success' : 'status-invalid'}`;
                fileStatus.textContent = `Completed (${validTripsFound} valid)`;
                progressBar.style.display = 'none';
                updateResultsTable();

            } catch (error) {
                console.error('Error processing image:', error);
                fileItem.className = 'file-item error';
                fileStatus.className = 'file-status status-error';
                fileStatus.textContent = 'Error processing';
                progressBar.style.display = 'none';
            }
        };
        // Usamos el mismo dataURL para crear la imagen
        img.src = imageDataURL;
    };
    fileReader.readAsDataURL(file);
}




function preprocessImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const threshold = 150;
        const value = gray > threshold ? 255 : 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

// ====================================================================
// NUEVAS FUNCIONES DE SUPERVISIÓN (NO INVASIVAS)
// ====================================================================

/**
 * Cuenta cuántas veces aparece la palabra "Rebook" en el texto.
 * @param {string} text - El texto crudo del OCR.
 * @returns {number} - El número de "Rebooks" encontrados.
 */
function superviseParsing(text) {
    const rebookRegex = /rebook/gi;
    const matches = text.match(rebookRegex);
    return matches ? matches.length : 0;
}

/**
 * --- VERSIÓN HÍBRIDA DEFINITIVA: Parser JS + LLM Fallback + Extracción de Incompletos ---
 * Primero usa lógica dura y determinista. La IA es solo un respaldo.
 * AÑADIDO: Si hay inconsistencia, extrae el recibo incompleto y lo añade a los resultados.
 */
async function extractTripsWithLLM(ocrText) {
    console.log("🚀 Iniciando Parser Híbrido con Supervisión...");

    // --- PASO DE SUPERVISIÓN ---
    const rebookCount = superviseParsing(ocrText);
    console.log(`🔍 [SUPERVISIÓN] Se encontraron ${rebookCount} palabras "Rebook" en el texto.`);

    // --- PASO 1: PARSER DETERMINISTA DE JAVASCRIPT ---
    const jsTrips = parseTripsWithJS(ocrText);

    // --- NUEVO: LÓGICA PARA EXTRAER Y AÑADIR EL INCOMPLETO ---
    if (rebookCount > jsTrips.length) {
        console.warn(`⚠️ [SUPERVISIÓN] ¡Inconsistencia detectada! Se esperaban ${rebookCount} viajes, pero el parser solo extrajo ${jsTrips.length}.`);

        const incompleteTrip = extractIncompleteTrip(ocrText);
        if (incompleteTrip) {
            jsTrips.push(incompleteTrip); // <-- ¡Añadimos el viaje incompleto al array!
            console.log(`✅ [SUPERVISIÓN] Recibo incompleto procesado y añadido a los resultados.`);
        }
    }

    if (jsTrips.length > 0) {
        console.log(`✅ Parser JS encontró ${jsTrips.length} viajes (incluyendo posibles incompletos). No se necesita la IA.`);
        return jsTrips;
    }

    // --- PASO 2: FALLBACK A LA IA (si el parser JS falló) ---
    console.log("⚠️ El parser JS no encontró viajes. Activando fallback a la IA...");
    return await parseTripsWithLLM(ocrText);
}

/**
 * --- NUEVA FUNCIÓN: Extrae un recibo incompleto del texto ---
 * Busca el último "Rebook" que no tenga un precio LKR asociado debajo.
 */
function extractIncompleteTrip(ocrText) {
    const lines = ocrText.split('\n');
    const priceRegex = /LKR\s*([0-9QOA.]+)/i;
    const timeRegex = /(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
    const dateRegex = /\b(\d{1,2}\s+\w{3})\b/i;
    const rebookRegex = /rebook/i;

    // Encontrar todos los índices de las líneas que contienen "Rebook"
    const rebookIndices = [];
    lines.forEach((line, index) => {
        if (rebookRegex.test(line)) {
            rebookIndices.push(index);
        }
    });

    // Iterar hacia atrás para encontrar el último "Rebook" incompleto
    for (let i = rebookIndices.length - 1; i >= 0; i--) {
        const rebookLineIndex = rebookIndices[i];

        // Comprobar si hay un precio en las siguientes 3 líneas
        let hasPriceNearby = false;
        for (let j = rebookLineIndex + 1; j <= rebookLineIndex + 3 && j < lines.length; j++) {
            if (priceRegex.test(lines[j])) {
                hasPriceNearby = true;
                break;
            }
        }

        // Si no hay precio, este es nuestro candidato
        if (!hasPriceNearby) {
            const rebookLine = lines[rebookLineIndex].trim();
            const destinationLine = lines[rebookLineIndex - 1] ? lines[rebookLineIndex - 1].trim() : '';

            // Extraer datos
            const timeMatch = rebookLine.match(timeRegex);
            const dateMatch = rebookLine.match(dateRegex);
            const cleanDestination = cleanDestinationName(destinationLine);

            if (cleanDestination) {
                const incompleteTrip = {
                    destination: cleanDestination,
                    total_lkr: null,
                    status: 'incomplete',
                    trip_time: timeMatch ? timeMatch[1] : null,
                    trip_date: dateMatch ? dateMatch[1] : null
                };

                // Log simple y limpio
                console.log(`⚠️ [RECIBO INCOMPLETO] Destino: "${incompleteTrip.destination}", Hora: "${incompleteTrip.trip_time}"`);

                return incompleteTrip;
            }
        }
    }

    return null; // No se encontró ningún recibo incompleto
}

/**
 * --- NUEVA FUNCIÓN: LIMPIADOR DE NOMBRES DE DESTINO ---
 * Usa una lista blanca para limpiar los nombres extraídos por el OCR.
 */
function cleanDestinationName(rawDestination) {
    if (!rawDestination) return '';

    let cleanedText = rawDestination.trim();

    // 1. Eliminar "Rebook" y todo lo que siga (case insensitive)
    cleanedText = cleanedText.replace(/rebook[\s\S]*/i, '');

    // 2. Eliminar patrones de fecha y hora que suelen aparecer al final
    //    Ej: "Nov 24", "9:34 PM", "Oct 12 - 10:00 AM"
    //    Buscamos meses abreviados seguidos de dígitos
    cleanedText = cleanedText.replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}[\s\S]*/i, '');

    //    Buscamos horas (ej: 9:34 PM, 10:00am)
    cleanedText = cleanedText.replace(/\d{1,2}:\d{2}\s*(?:am|pm)?[\s\S]*/i, '');

    // 3. Limpieza final de caracteres basura al final de la cadena
    //    Elimina cualquier cosa que no sea letra, número o paréntesis de cierre al final
    //    Ahora también elimina basura separada por espacios como " ‘t"
    cleanedText = cleanedText.replace(/[^a-zA-Z0-9)]+$/, '');

    //    Limpieza específica para basura común como " ‘t" o " .‘T" que queda tras el OCR
    cleanedText = cleanedText.replace(/\s+['‘`][a-zA-Z0-9]*$/, '');

    cleanedText = cleanedText.trim();

    // --- LISTA BLANCA (WHITELIST) ---
    // Si después de limpiar coincide con algo conocido, usamos el nombre canónico.
    const lowerCleaned = cleanedText.toLowerCase();
    const knownDestinations = {
        'mireka tower': 'Mireka Tower',
        '43b lauries rd': '43b Lauries Rd',
        '43d lauries rd': '43d Lauries Rd',
        'colombo 00400': 'Colombo 00400',
        'seylan bank': 'Seylan Bank',
        'ar exotics': 'AR Exotics Marine',
        'get u fit': 'Get U Fit Gym',
        'get ufitgym': 'Get U Fit Gym', // Variante detectada
        'keells': 'Keells - Lauries',
        'jungle juice': 'Jungle Juice Bar',
        'resistance gym': 'Resistance Gym',
        'colombo bandaranaike international airport': 'Bandaranaike Intl Airport' // Nombre acortado
    };

    for (const keyword in knownDestinations) {
        if (lowerCleaned.includes(keyword)) {
            return knownDestinations[keyword];
        }
    }

    // Si no está en la whitelist, devolvemos el texto limpio "best effort"
    if (cleanedText.length < 3) {
        console.warn(`⚠️ Destino demasiado corto tras limpieza: "${rawDestination}" -> "${cleanedText}"`);
        return rawDestination.trim(); // Fallback al original si nos pasamos de limpieza
    }

    return cleanedText;
}

/**
 * --- FUNCIÓN AUXILIAR: El parser de JavaScript ---
 * Usa regex para encontrar precios y luego lee hacia atrás para encontrar el destino.
 */
function parseTripsWithJS(text) {
    const trips = [];
    const lines = text.split('\n');
    // Regex actualizado para aceptar comas en el precio: 3,392.64
    const priceRegex = /LKR\s*([0-9QOA.,]+)/i;
    const timeRegex = /(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;

    const priceLineIndices = [];
    lines.forEach((line, index) => {
        if (priceRegex.test(line)) {
            priceLineIndices.push(index);
        }
    });

    const relevantPriceLines = priceLineIndices.slice(0, 8);

    for (let i = 0; i < relevantPriceLines.length; i++) {
        const priceLineIndex = relevantPriceLines[i];
        const priceLine = lines[priceLineIndex];

        const priceMatch = priceLine.match(priceRegex);
        // Limpiamos OCR errors (Q->0, O->0, A->4) y eliminamos comas
        let total_lkr = priceMatch[1].replace(/Q|O/g, '0').replace(/A/g, '4').replace(/,/g, '');

        if (!total_lkr.includes('.') && total_lkr.length > 2) {
            // Si el número no tiene punto y tiene más de 2 dígitos
            // Insertamos el punto antes de los últimos 2 dígitos
            // Ejemplo: "24000" → "240.00"
            total_lkr = total_lkr.slice(0, -2) + '.' + total_lkr.slice(-2);
        }

        // Validación de precio mínimo (180 LKR)
        const numericPrice = parseFloat(total_lkr);
        let status = 'valid';

        if (isNaN(numericPrice) || numericPrice < 180) {
            console.warn(`⚠️ Precio inválido o muy bajo detectado: ${total_lkr} (Original: ${priceMatch[1]})`);
            status = 'invalid';
        }

        if (priceLine.toLowerCase().includes('canceled')) {
            status = 'valid'; // Mantener como válido si es cancelado (según lógica anterior, revisar si debe ser invalid)
        } else if (priceLine.toLowerCase().includes('view store')) {
            status = 'invalid';
        }

        let destination = '';
        let tripTime = null;

        // Extraer la hora del viaje
        for (let j = priceLineIndex - 5; j <= priceLineIndex + 5; j++) {
            if (j >= 0 && j < lines.length) {
                const timeMatch = lines[j].match(timeRegex);
                if (timeMatch) {
                    tripTime = timeMatch[1];
                    break;
                }
            }
        }

        for (let j = priceLineIndex - 1; j >= 0; j--) {
            const lineAbove = lines[j].trim();
            if (priceRegex.test(lineAbove) || lineAbove.toLowerCase().includes('activity')) {
                break;
            }
            if (/\d{1,2}:\d{2}|^[~©¢&]/.test(lineAbove) || lineAbove.length < 2) {
                continue;
            }
            destination = lineAbove + ' ' + destination;
        }

        // --- CAMBIO CLAVE: AQUÍ USAMOS EL LIMPIADOR ---
        const cleanDestination = cleanDestinationName(destination);

        if (cleanDestination) {
            trips.push({ destination: cleanDestination, total_lkr, status, trip_time: tripTime });
        }
    }

    return trips;
}
async function parseTripsWithLLM(ocrText) {
    // Usamos el prompt "few-shot" que ya funcionaba bien
    const prompt = `
Extract trip data from the following text. Return a JSON array of strings, each in format: "destination|total_lkr|status|trip_time".
Max 8 trips.
Example: ["Mireka Tower|250.00|valid|10:30am"]

Text:
"""
 ${ocrText}
"""
`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        const llmResponse = data.message || '';
        console.log("--- Respuesta del Fallback a la IA ---");
        console.log(llmResponse);

        const stringArray = parseLLMStringArray(llmResponse);
        const tripsData = [];
        if (Array.isArray(stringArray)) {
            for (const tripString of stringArray) {
                const parts = tripString.split('|');
                if (parts.length >= 3) {
                    tripsData.push({
                        destination: parts[0].trim(),
                        total_lkr: parts[1].trim(),
                        status: parts[2].trim(),
                        trip_time: parts[3] ? parts[3].trim() : null
                    });
                }
            }
        }

        return tripsData;

    } catch (error) {
        console.error('Error en el fallback a la IA:', error);
        throw error;
    }
}

function parseLLMStringArray(rawResponse) {
    const attempts = [];
    const trimmed = rawResponse ? rawResponse.trim() : '';
    if (trimmed) {
        attempts.push({ label: 'raw', payload: trimmed });
    }

    try {
        const normalized = normalizeLLMResponse(rawResponse);
        if (normalized && normalized !== trimmed) {
            attempts.push({ label: 'normalized', payload: normalized });
        }
    } catch (normError) {
        console.warn('[LLM fallback] No se pudo normalizar la respuesta:', normError.message);
    }

    let lastError = null;
    for (const attempt of attempts) {
        try {
            const parsed = JSON.parse(attempt.payload);
            if (Array.isArray(parsed)) {
                if (attempt.label !== 'raw') {
                    console.warn(`[LLM fallback] Respuesta limpiada mediante intento "${attempt.label}".`);
                }
                return parsed;
            }
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('Both JS parser and LLM fallback failed.');
}

function normalizeLLMResponse(rawResponse) {
    let cleaned = rawResponse.trim();
    if (!cleaned) {
        throw new Error('Empty response from LLM.');
    }

    // Remove markdown code fences if present
    if (cleaned.startsWith('```')) {
        const fenceEnd = cleaned.lastIndexOf('```');
        if (fenceEnd > 0) {
            cleaned = cleaned.substring(cleaned.indexOf('\n') + 1, fenceEnd).trim();
        }
    }

    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        throw new Error('LLM response missing JSON array.');
    }

    let arraySegment = cleaned.substring(startIdx, endIdx + 1);
    // Strip JS-style comments and trailing commas
    arraySegment = arraySegment
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*]/g, ']');

    return arraySegment.trim();
}

// --- LÓGICA COMPARTIDA (con ajustes menores) ---
function createFileItem(file, type) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item processing';
    fileItem.id = `file-${type}-${file.name.replace(/\s/g, '-')}`;
    const fileHeader = document.createElement('div');
    fileHeader.className = 'file-header';
    const fileName = document.createElement('div');
    fileName.className = 'file-name';
    fileName.textContent = file.name;
    const fileStatus = document.createElement('div');
    fileStatus.className = 'file-status status-processing';
    fileStatus.textContent = 'Processing...';
    fileHeader.appendChild(fileName);
    fileHeader.appendChild(fileStatus);
    fileItem.appendChild(fileHeader);
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    const progress = document.createElement('div');
    progress.className = 'progress';
    progressBar.appendChild(progress);
    fileItem.appendChild(progressBar);
    if (type === 'image') {
        const imgPreview = document.createElement('img');
        imgPreview.className = 'image-preview';
        imgPreview.src = URL.createObjectURL(file);
        fileItem.appendChild(imgPreview);
    }
    return fileItem;
}

// ... (mantener todo el código anterior hasta la función processExtractedText)

function processExtractedText(file, fileItem, text, type, tripInfo) {
    // --- INTENTO 1: Lógica principal para el formato común ---
    let totalMatch = text.match(/Total\s+([\d,.]+)\s+LKR/i);
    // --- INTENTO 2: Respaldo para formatos inusuales (solo si el primero falla) --
    if (!totalMatch) {
        totalMatch = text.match(/Total\s+LKR\s*([\d,.]+)/i);
    }
    const total = totalMatch ? totalMatch[1] : null;
    const validationResult = validateTrip(tripInfo, type);
    const fileStatus = fileItem.querySelector('.file-status');
    const progressBar = fileItem.querySelector('.progress-bar');
    if (progressBar) progressBar.style.display = 'none';
    if (total) {
        const fileTotal = document.createElement('div');
        fileTotal.className = 'file-total';
        fileTotal.textContent = `${total} LKR`;
        fileItem.appendChild(fileTotal);
        if (validationResult.isValid) {
            fileItem.className = 'file-item success';
            fileStatus.className = 'file-status status-success';
            fileStatus.textContent = 'Valid';

            // NUEVO: Extraer información detallada del viaje solo para PDFs válidos
            if (type === 'pdf') {
                const tripDetails = extractTripDetails(text);
                console.log(`=== TRIP DETAILS [${file.name}] ===`);
                console.log(`Trip Date: ${tripDetails.tripDate}`);
                console.log(`Start Time: ${tripDetails.startTime}`);
                console.log(`End Time: ${tripDetails.endTime}`);
                console.log(`Transport Type: ${tripDetails.transportType}`);
                console.log(`Origin: ${tripDetails.origin}`);
                console.log(`Destination: ${tripDetails.destination}`);
                console.log(`=======================================`);

                // Guardar detalles del viaje en el objeto de resultados para validaciones futuras
                const resultIndex = fileResults.findIndex(result => result.name === file.name);
                if (resultIndex !== -1) {
                    fileResults[resultIndex].tripDetails = tripDetails;
                }
            }

            if (type === 'pdf' && validationResult.direction) displayMap(file.name, validationResult.direction);
        } else {
            fileItem.className = 'file-item invalid';
            fileStatus.className = 'file-status status-invalid';
            fileStatus.textContent = 'Invalid';
            mapContainer.style.display = 'none';
        }
    } else {
        fileItem.className = 'file-item error';
        fileStatus.className = 'file-status status-error';
        fileStatus.textContent = 'Error: Total not found';
        mapContainer.style.display = 'none';
    }

    // --- NUEVO: Extraer la fecha del viaje ---
    const dateMatch = text.match(/\b(\d{1,2}\s+\w{3})\b/i); // Busca "1 oct", "2 nov", etc.
    const tripDate = dateMatch ? dateMatch[1] : 'Unknown Date';

    fileResults.push({
        name: file.name,
        type: type,
        total: total,
        origin: tripInfo.origin || 'Not specified',
        destination: tripInfo.destination || 'Not specified',
        isValid: validationResult.isValid,
        validationDetails: validationResult.details,
        text: text,
        tripDate: tripDate,
        direction: validationResult.direction, // <-- AÑADE LA FECHA AL OBJETO
        tripTime: tripInfo.tripTime // <-- AÑADE LA HORA AL OBJETO
    });

    updateResultsTable();
}

// NUEVA FUNCIÓN: Extraer detalles específicos del viaje
function extractTripDetails(text) {
    const tripDetails = {
        tripDate: 'Not found',
        startTime: 'Not found',
        endTime: 'Not found',
        transportType: 'Not found',
        origin: 'Not found',
        destination: 'Not found'
    };

    // Extraer fecha del viaje (formato "Nov 16, 2025", "9 nov 2025" o "11/16/25")
    const datePatterns = [
        /(\w{3}\s+\d{1,2},\s+\d{4})/,  // Nov 16, 2025
        /(\d{1,2}\s+\w{3}\s+\d{4})/,    // 9 nov 2025
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/    // 11/16/25
    ];

    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            tripDetails.tripDate = match[1];
            break;
        }
    }

    // Extraer tipo de transporte (Tuk o Zip) - patrones mejorados
    const transportPatterns = [
        /Trip details\s+(Tuk|Zip)/i,
        /(Tuk|Zip)\s+\d+.\d+\s+kilometers/i,
        /Detalles del viaje\s+(Tuk|Zip)/i,
        /(Tuk|Zip)\s+\d+.\d+\s+kilómetros/i
    ];

    for (const pattern of transportPatterns) {
        const match = text.match(pattern);
        if (match) {
            tripDetails.transportType = match[1];
            break;
        }
    }

    // Extraer direcciones con horas - método mejorado y más flexible
    // Primero intentamos con el formato que incluye AM/PM
    let timeLocationPattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\s+([A-Za-z0-9\s,]+Sri Lanka)/g;
    let matches = [...text.matchAll(timeLocationPattern)];

    // Si no encontramos suficientes coincidencias, intentamos sin AM/PM
    if (matches.length < 2) {
        timeLocationPattern = /(\d{1,2}:\d{2})\s+([A-Za-z0-9\s,]+Sri Lanka)/g;
        matches = [...text.matchAll(timeLocationPattern)];
    }

    if (matches.length >= 2) {
        // Ordenamos las horas para asegurar que startTime < endTime
        const timeData = matches.map(match => ({
            time: match[1],
            location: match[2].trim()
        }));

        // Convertimos las horas a minutos para comparar
        const convertToMinutes = (timeStr) => {
            // Verificar si ya tiene AM/PM
            const hasAmPm = /am|pm/i.test(timeStr);

            let [hours, minutes] = timeStr.split(':').map(Number);

            // Si no tiene AM/PM, asumimos que es formato 24h
            if (!hasAmPm) {
                return hours * 60 + minutes;
            }

            // Si tiene AM/PM, convertimos a formato 24h
            const period = timeStr.match(/am|pm/i)[0].toLowerCase();
            const totalMinutes = (hours % 12) * 60 + minutes + (period === 'pm' ? 720 : 0);
            return totalMinutes;
        };

        // Ordenamos por tiempo
        timeData.sort((a, b) => convertToMinutes(a.time) - convertToMinutes(b.time));

        tripDetails.startTime = timeData[0].time;
        tripDetails.origin = timeData[0].location;
        tripDetails.endTime = timeData[timeData.length - 1].time;
        tripDetails.destination = timeData[timeData.length - 1].location;
    }

    return tripDetails;
}
// ... (mantener el resto del código sin cambios)





















/**
 * --- VERSIÓN 2: LÓGICA DE VALIDACIÓN CON SEGUNDA OPORTUNIDAD ---
 * Mantiene la lógica estricta y añade una flexible como respaldo.
 */
function validateTrip(tripInfo, type) {
    // --- CAMINO 1: LÓGICA PARA IMÁGENES (sin cambios) ---
    if (type === 'image') {
        if (tripInfo.status === 'invalid') {
            return { isValid: false, details: 'Invalid: Classified as Food/Delivery by AI.', direction: null };
        }
        if (tripInfo.status === 'incomplete') {
            return { isValid: false, details: 'Incomplete receipt: Missing price or other data.', direction: null };
        }
        if (tripInfo.status === 'valid') {
            const destinationText = (tripInfo.destination || '').toLowerCase().trim();
            const validPatterns = [/^43b/, /^43d/, /^mireka/];
            const isDestinationValidByPattern = validPatterns.some(pattern => pattern.test(destinationText));
            if (isDestinationValidByPattern) {
                // Determinar la dirección basada en el destino
                let direction = null;
                if (destinationText.includes('43b') || destinationText.includes('43d') || destinationText.includes('lauries')) {
                    direction = 'office-to-home'; // Si va a casa, es oficina a casa
                } else if (destinationText.includes('mireka') || destinationText.includes('havelock') || destinationText.includes('324')) {
                    direction = 'home-to-office'; // Si va a la oficina, es casa a oficina
                }
                return { isValid: true, details: 'Valid (matches a valid destination pattern)', direction: direction };
            }
            const staticValidDestinations = ['colombo 00400'];
            const isDestinationValidByList = staticValidDestinations.some(validDest => destinationText.includes(validDest));
            if (isDestinationValidByList) {
                return { isValid: true, details: 'Valid (found in static list)', direction: null };
            }
            return { isValid: false, details: 'Invalid (Destination does not match any known pattern or list)', direction: null };
        }
    }

    // --- CAMINO 2: LÓGICA PARA PDFs (CON SEGUNDA OPORTUNIDAD) ---
    if (type === 'pdf') {
        if (!tripInfo.origin || !tripInfo.destination) {
            return { isValid: false, details: 'Could not extract addresses from PDF.', direction: null };
        }

        const originText = tripInfo.origin.trim();
        const destinationText = tripInfo.destination.trim().toLowerCase();

        // --- PRIMERA VALIDACIÓN (Lógica Estricta Actual) ---
        const isHome = (address) => address.startsWith('43');
        const isOffice = (address) => {
            const addr = address.toLowerCase();
            return addr.startsWith('324') || addr.includes('havelock') || addr.includes('mireka tower');
        };

        const isOriginHome = isHome(originText);
        const isDestinationOffice = isOffice(destinationText);
        const isOriginOffice = isOffice(originText);
        const isDestinationHome = isHome(destinationText);

        if (isOriginHome && isDestinationOffice) {
            return { isValid: true, details: 'Valid: Home -> Office route.', direction: 'home-to-office' };
        }
        if (isOriginOffice && isDestinationHome) {
            return { isValid: true, details: 'Valid: Office -> Home route.', direction: 'office-to-home' };
        }

        // --- SEGUNDA VALIDACIÓN (Lógica Flexible por Palabras Clave) ---
        // Solo se ejecuta si la primera validación falló.
        const originZone = findZone(tripInfo.origin);
        const destinationZone = findZone(tripInfo.destination);

        if (originZone === 'home' && destinationZone === 'office') {
            return { isValid: true, details: 'Valid (by keyword match): Home -> Office route.', direction: 'home-to-office' };
        }
        if (originZone === 'office' && destinationZone === 'home') {
            return { isValid: true, details: 'Valid (by keyword match): Office -> Home route.', direction: 'office-to-home' };
        }

        // --- SI NADA FUNCIONA, ES INVÁLIDO ---
        return { isValid: false, details: 'Invalid: Addresses do not meet rules after multiple checks.', direction: null };
    }

    return { isValid: false, details: 'Invalid: Unknown file type or status from AI.', direction: null };
}

function displayMap(fileName, direction) {
    mapContainer.style.display = 'block';
    let mapTitle = document.querySelector('.map-title');
    if (!mapTitle) {
        mapTitle = document.createElement('div');
        mapTitle.className = 'map-title';
        mapContainer.prepend(mapTitle);
    }
    mapTitle.textContent = `Trip Map: ${fileName}`;
    let originCoords, destCoords;
    if (direction === 'home-to-office') {
        originCoords = staticLocations.home;
        destCoords = staticLocations.office;
    } else {
        originCoords = staticLocations.office;
        destCoords = staticLocations.home;
    }
    if (!map) {
        map = L.map('map-container').setView([6.9, 79.86], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    }
    map.eachLayer(layer => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            map.removeLayer(layer);
        }
    });
    L.marker(originCoords).addTo(map).bindPopup('Origin').openPopup();
    L.marker(destCoords).addTo(map).bindPopup('Destination');
    const lineColor = (direction === 'home-to-office') ? 'blue' : 'green';
    const route = L.polyline([originCoords, destCoords], {
        color: lineColor,
        weight: 5,
        opacity: 0.7
    }).addTo(map);
    const group = new L.featureGroup([L.marker(originCoords), L.marker(destCoords)]);
    map.fitBounds(group.getBounds().pad(0.1));
    setTimeout(() => {
        map.invalidateSize();
    }, 0);
}

function updateResultsTable() {
    if (!fileResults.length) {
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (groupedResults) groupedResults.innerHTML = '';
        resultsBody.innerHTML = '';
        summary.innerHTML = '';
        updateSummaryCards(0, 0, 0, 0);
        return;
    }

    resultsContainer.style.display = 'block';
    const totalSpent = fileResults.reduce((sum, result) => sum + (result.isValid ? parseAmount(result.total) : 0), 0);
    const activeDays = new Set(fileResults.filter(r => r.tripDate).map(r => r.tripDate));
    const imageSet = new Set(fileResults.filter(r => r.type === 'image').map(r => r.name));

    updateSummaryCards(totalSpent, fileResults.length, activeDays.size, imageSet.size);
    renderGroupedResults();
    setResultsView(currentResultsView);

    resultsBody.innerHTML = '';
    let tableSum = 0;
    let validCount = 0;
    let invalidCount = 0;
    fileResults.forEach((result) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = result.name;
        const typeCell = document.createElement('td');
        typeCell.textContent = result.type === 'pdf' ? 'PDF' : 'Image';
        const originCell = document.createElement('td');
        originCell.textContent = result.origin ? result.origin.substring(0, 50) + (result.origin.length > 50 ? '...' : '') : 'Not found';
        const destCell = document.createElement('td');
        destCell.textContent = result.destination ? result.destination.substring(0, 50) + (result.destination.length > 50 ? '...' : '') : 'Not found';

        const totalCell = document.createElement('td');
        if (result.total && result.total !== '.' && result.total !== '.') {
            totalCell.textContent = `${result.total} LKR`;
        } else {
            totalCell.textContent = '0.00 LKR';
        }

        const validationCell = document.createElement('td');
        let badgeText, badgeClass;
        if (result.validationDetails.includes('Incomplete receipt')) {
            badgeText = 'Incomplete';
            badgeClass = 'valid-badge incomplete';
        } else if (result.isValid) {
            badgeText = 'Valid';
            badgeClass = 'valid-badge valid';
        } else {
            badgeText = 'Invalid';
            badgeClass = 'valid-badge invalid';
        }

        const validationBadge = document.createElement('span');
        validationBadge.className = badgeClass;
        validationBadge.textContent = badgeText;
        validationCell.appendChild(validationBadge);

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'validation-details';
        detailsDiv.textContent = result.validationDetails || '';
        validationCell.appendChild(detailsDiv);

        const actionsCell = document.createElement('td');
        const viewBtn = document.createElement('button');
        viewBtn.className = 'view-details-btn';
        viewBtn.textContent = 'View details';
        viewBtn.onclick = function () {
            modalExtractedText.textContent = result.text;
            modal.style.display = 'block';
        };
        actionsCell.appendChild(viewBtn);

        row.appendChild(nameCell);
        row.appendChild(typeCell);
        row.appendChild(originCell);
        row.appendChild(destCell);
        row.appendChild(totalCell);
        row.appendChild(validationCell);
        row.appendChild(actionsCell);
        resultsBody.appendChild(row);

        if (result.total && result.total !== '.' && result.total !== '0.00' && result.isValid) {
            tableSum += parseAmount(result.total);
        }

        if (result.isValid) {
            validCount++;
        } else {
            invalidCount++;
        }
    });
    summary.innerHTML = `<p>Total trips: ${fileResults.length}</p><p>Valid trips: ${validCount}</p><p>Invalid trips: ${invalidCount}</p><p>Total LKR sum (valid trips): ${tableSum.toFixed(2)} LKR</p>`;

    updateTripCalendar();//estamos actualizando esto, antes "updateTripChart();"
}

function parseAmount(value) {
    if (value === null || value === undefined) return 0;
    const sanitized = String(value).replace(/[^\d.,-]/g, '').replace(',', '.');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
}

function formatCurrency(amount) {
    return `${amount.toFixed(2)} LKR`;
}

function setResultsView(view) {
    currentResultsView = view;
    if (groupedViewBtn) groupedViewBtn.classList.toggle('active', view === 'grouped');
    if (tableViewBtn) tableViewBtn.classList.toggle('active', view === 'table');
    if (groupedResults) groupedResults.style.display = (view === 'grouped') ? 'block' : 'none';
    if (tableResultsWrapper) tableResultsWrapper.style.display = (view === 'table') ? 'block' : 'none';
}

function updateSummaryCards(totalSpent, totalRides, activeDays, imageCount) {
    if (summaryTotalSpent) summaryTotalSpent.textContent = formatCurrency(totalSpent);
    if (summaryTotalRides) summaryTotalRides.textContent = totalRides;
    if (summaryActiveDays) summaryActiveDays.textContent = activeDays;
    if (summaryImages) summaryImages.textContent = imageCount;
}

function renderGroupedResults() {
    if (!groupedResults) return;
    groupedResults.innerHTML = '';
    if (!fileResults.length) {
        groupedResults.innerHTML = '<p class="empty-state">No files processed yet.</p>';
        return;
    }

    const groupedMap = {};
    fileResults.forEach(result => {
        const key = `${result.type}-${result.name}`;
        if (!groupedMap[key]) {
            groupedMap[key] = {
                name: result.name,
                type: result.type,
                trips: []
            };
        }
        groupedMap[key].trips.push(result);
    });

    Object.values(groupedMap).forEach(group => {
        const totalValidAmount = group.trips.reduce((sum, trip) => sum + (trip.isValid ? parseAmount(trip.total) : 0), 0);
        const validTrips = group.trips.filter(trip => trip.isValid).length;

        const card = document.createElement('div');
        card.className = 'group-card';

        const header = document.createElement('div');
        header.className = 'group-card-header';
        header.innerHTML = `
            <div>
                <p class="group-file-name">${group.name}</p>
                <p class="group-meta">${group.trips.length} trip(s) • ${group.type === 'pdf' ? 'PDF' : 'Image'}</p>
            </div>
            <div class="group-card-meta">
                <span class="group-total">${formatCurrency(totalValidAmount)}</span>
                <span class="group-validity ${validTrips > 0 ? 'valid' : 'invalid'}">${validTrips} valid</span>
                <button class="group-toggle" type="button">Expand</button>
            </div>
        `;

        const body = document.createElement('div');
        body.className = 'group-card-body';

        group.trips.forEach(trip => {
            const row = document.createElement('div');
            row.className = 'group-trip-row';
            const dateLabel = trip.tripDate || '';
            const timeLabel = trip.tripTime || '';
            row.innerHTML = `
                <div class="trip-info">
                    <p class="trip-destination">${trip.destination || 'Destination not specified'}</p>
                    <div class="trip-subline">
                        ${dateLabel ? `<span>${dateLabel}</span>` : ''}
                        ${timeLabel ? `<span>${timeLabel}</span>` : ''}
                    </div>
                </div>
                <div class="trip-values">
                    <span class="trip-amount">${formatCurrency(parseAmount(trip.total))}</span>
                    <span class="trip-badge ${trip.isValid ? 'valid' : 'invalid'}">${trip.isValid ? 'Valid' : 'Invalid'}</span>
                </div>
            `;
            body.appendChild(row);
        });

        card.appendChild(header);
        card.appendChild(body);

        const toggleBtn = header.querySelector('.group-toggle');
        toggleBtn.addEventListener('click', () => {
            const isOpen = body.classList.toggle('open');
            toggleBtn.textContent = isOpen ? 'Collapse' : 'Expand';
        });

        groupedResults.appendChild(card);
    });
}

// --- LÓGICA PARA EL GRÁFICO DE VIAJES ---

const viewChartBtn = document.getElementById('viewChartBtn');
const chartModal = document.getElementById('chartModal');
const closeChartBtn = document.getElementById('closeChartBtn');
let currentMonth = new Date().getMonth();

let currentYear = new Date().getFullYear();

viewChartBtn.addEventListener('click', () => {
    chartModal.style.display = 'block';
    updateTripCalendar();
});

/**
 * --- FUNCIÓN PRINCIPAL: Actualiza y dibuja el calendario de viajes ---
 */
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

    }
}