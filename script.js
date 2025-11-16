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
const resultsBody = document.getElementById('resultsBody');
const summary = document.getElementById('summary');
const clearBtn = document.getElementById('clearBtn');
const mapContainer = document.getElementById('map-container');
const modal = document.getElementById('detailsModal');
const modalExtractedText = document.getElementById('modalExtractedText');
const closeBtn = document.querySelector('#detailsModal .close');
const apiStatus = document.getElementById('apiStatus');
const tooltip = document.getElementById('tooltip');

let fileResults = [];
let map = null;
let processedPdfNames = new Set(); //memory for pdf
let processedImageNames = new Set(); //memory for png or images

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
    processedPdfNames.clear();      //clean pdf memory
    processedImageNames.clear();   //clean image or png memory
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
        // --- PASO 1: Revisar si ya fue procesado ---
        if (processedPdfNames.has(file.name)) {
            const duplicateItem = createDuplicateFileItem(file, 'pdf');
            pdfFileList.appendChild(duplicateItem);
            return; // Detener el procesamiento para este archivo
        }
        
        // --- PASO 2: ¡AÑADIR EL NOMBRE A LA MEMORIA! ---
        // Esta es la línea clave que probablemente te falta o está en el lugar equivocado.
        processedPdfNames.add(file.name);

        // --- PASO 3: Procesar el archivo como nuevo ---
        const fileItem = createFileItem(file, 'pdf');
        pdfFileList.appendChild(fileItem);
        processPdfFile(file, fileItem);
    });
}

/**
 * --- FUNCIÓN AUXILIAR: Crea un elemento visual para archivos duplicados ---
 */
function createDuplicateFileItem(file, type) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item invalid'; // Usa el estilo 'invalid' (amarillo)
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
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
            let totalPages = pdf.numPages;
            let fullText = '';
            let pagePromises = [];
            for (let i = 1; i <= totalPages; i++) {
                pagePromises.push(pdf.getPage(i).then(function(page) {
                    return page.getTextContent().then(function(textContent) {
                        let pageText = '';
                        textContent.items.forEach(function(item) {
                            pageText += item.str + ' ';
                        });
                        return pageText;
                    });
                }));
            }
            Promise.all(pagePromises).then(function(pageTexts) {
                pageTexts.forEach(function(text) {
                    fullText += text + '\n';
                });
                const tripInfo = extractTripInfoFromPdf(fullText);
                processExtractedText(file, fileItem, fullText, 'pdf', tripInfo);
            });
        }).catch(function(error) {
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
        // --- INICIO DEL LIMPIADOR DE DUPLICADOS ---
        if (processedImageNames.has(file.name)) {
            // Si la imagen ya fue procesada, la ignora y muestra un aviso
            const duplicateItem = createDuplicateFileItem(file, 'image');
            imageFileList.appendChild(duplicateItem);
            return; // Detiene el procesamiento para este archivo
        }
        
        // --- CAMBIO CLAVE: AÑADIMOS EL NOMBRE A LA MEMORIA ---
        processedImageNames.add(file.name);
        // --- FIN DEL CAMBIO ---

        const fileItem = createFileItem(file, 'image');
        imageFileList.appendChild(fileItem);
        processImageFile(file, fileItem);
    });
}

// ... (mantener todo el código anterior)

function processImageFile(file, fileItem) {
    const fileReader = new FileReader();
    fileReader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const processedImgSrc = preprocessImage(img);
            
            const progressBar = fileItem.querySelector('.progress'); 
            const fileStatus = fileItem.querySelector('.file-status');
            Tesseract.recognize(processedImgSrc, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        progressBar.style.width = `${progress}%`;
                        fileStatus.textContent = `Processing... ${progress}%`;
                    }
                }
            })
            .then(({ data: { text } }) => {
                console.log("Raw OCR Text:", text);
                
                // NUEVO: Extraer todas las fechas y horas del texto de la imagen
                const allImageTripDetails = extractImageTripDetails(text);
                console.log("All extracted dates/times from image:", allImageTripDetails);
                
                // --- NUEVO: Usar LLM para estructurar los datos ---
                // Mostrar estado de procesamiento de la API
                apiStatus.style.display = 'block';
                apiStatus.className = 'api-status processing';
                apiStatus.textContent = 'Processing with AI...';
                
                extractTripsWithLLM(text)
                    .then(trips => {
                        console.log("Structured Data from LLM:", trips);
                        
                        // Ocultar estado de procesamiento
                        apiStatus.style.display = 'none';
                        
                        const fileDetails = document.createElement('div'); 
                        fileDetails.className = 'file-details'; 
                        fileDetails.textContent = `${trips.length} trip(s) found.`; 
                        fileItem.appendChild(fileDetails);
                        
                        let validTripsFound = 0;
                        trips.forEach((trip, index) => {
                            const validationResult = validateTrip(trip, 'image');
                            if (validationResult.isValid) validTripsFound++;
                            
                            // NUEVO: Mostrar en consola los detalles de cada viaje encontrado en la imagen
                            if (allImageTripDetails[index]) {
                                console.log(`=== IMAGE TRIP DETAILS [${file.name} - Trip ${index + 1}] ===`);
                                console.log(`Trip Date: ${allImageTripDetails[index].tripDate}`);
                                console.log(`Trip Time: ${allImageTripDetails[index].tripTime}`);
                                console.log(`Destination: ${trip.destination}`);
                                console.log(`================================================`);
                            } else {
                                console.warn(`Could not extract date/time for trip ${index + 1} in ${file.name}`);
                            }
                            
                            // Guardar los detalles extraídos en el objeto del viaje
                            trip.tripDate = allImageTripDetails[index] ? allImageTripDetails[index].tripDate : 'Not found';
                            trip.tripTime = allImageTripDetails[index] ? allImageTripDetails[index].tripTime : 'Not found';
                            
                            fileResults.push({ 
                                name: file.name, 
                                type: 'image', 
                                total: trip.total_lkr, 
                                origin: trip.origin || 'Not specified', 
                                destination: trip.destination, 
                                isValid: validationResult.isValid, 
                                validationDetails: validationResult.details, 
                                text: text,
                                tripTime: trip.trip_time || trip.tripTime || null // Usar la hora extraída si está disponible
                                // NO se añade tripDate para imágenes
                            });
                        });
                        fileItem.className = validTripsFound > 0 ? 'file-item success' : 'file-item invalid';
                        fileStatus.className = `file-status ${validTripsFound > 0 ? 'status-success' : 'status-invalid'}`;
                        fileStatus.textContent = `Completed (${validTripsFound} valid)`;
                        progressBar.style.display = 'none';
                        updateResultsTable();
                    })
                    .catch(error => {
                        console.error('Error processing with LLM:', error);
                        
                        // Mostrar estado de error
                        apiStatus.className = 'api-status error';
                        apiStatus.textContent = `Error processing with AI: ${error.message}`;
                        
                        fileItem.className = 'file-item error';
                        fileStatus.className = 'file-status status-error';
                        fileStatus.textContent = 'Error processing with AI';
                        progressBar.style.display = 'none';
                    });
            }).catch(err => { 
                console.error('Error processing image:', err); 
                fileItem.className = 'file-item error'; 
                fileStatus.className = 'file-status status-error'; 
                fileStatus.textContent = 'Error processing'; 
                progressBar.style.display = 'none'; 
            });
        };
        img.src = e.target.result;
    };
    fileReader.readAsDataURL(file);
}


// NUEVA FUNCIÓN: Extraer fechas y horas específicas de imágenes (OCR) - MEJORADA
function extractImageTripDetails(text) {
    const detailsArray = [];
    
    // Dividir el texto en líneas para un análisis más preciso
    const lines = text.split('\n');
    
    // Para cada línea, buscar patrones de fecha/hora
    lines.forEach(line => {
        // Patrones específicos para diferentes formatos de fecha/hora con errores de OCR
        const patterns = [
            // Formato estándar: Nov 10 -12:34 PM
            {
                regex: /(\w{3}\s*\d{1,2})\s*[-–]\s*(\d{1,2}[+:]\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/\s+/g, ' ').trim(),
                    time: match[2].replace(/[+]/g, ':').trim() + ' ' + match[3]
                })
            },
            // Formato sin espacios: Nov10-10:18 AM
            {
                regex: /(\w{3}\s*\d{1,2})\s*[-–]\s*(\d{1,2}[+:]\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/\s+/g, ' ').trim(),
                    time: match[2].replace(/[+]/g, ':').trim() + ' ' + match[3]
                })
            },
            // Formato con errores de OCR: Nov @+ 12:42 PM (donde @ es un 9)
            {
                regex: /(\w{3}\s*[@]\s*\d{1,2})\s*[-–]\s*(\d{1,2}[+:]\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/[@]/g, '9').replace(/\s+/g, ' ').trim(),
                    time: match[2].replace(/[+]/g, ':').trim() + ' ' + match[3]
                })
            },
            // Formato con espacios faltantes: Nov 8718 PM (donde 8718 es 8:18)
            {
                regex: /(\w{3}\s*\d{1,2})\s*[-–]\s*(\d{1,2})(\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/\s+/g, ' ').trim(),
                    time: `${match[2]}:${match[3]} ${match[4]}`
                })
            },
            // Formato con punto: Nov7.448PM (donde 448 es 4:48)
            {
                regex: /(\w{3}\s*\.?\s*\d{1,2})\.?(\d{1,2})(\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim(),
                    time: `${match[2]}:${match[3]} ${match[4]}`
                })
            },
            // Formato con +: Nov7+528PM (donde 528 es 5:28)
            {
                regex: /(\w{3}\s*[+.]\s*\d{1,2})\s*(\d{1,2})(\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/[+.]/g, ' ').replace(/\s+/g, ' ').trim(),
                    time: `${match[2]}:${match[3]} ${match[4]}`
                })
            },
            // Formato sin separador: Nov 7 558PM (donde 558 es 5:58)
            {
                regex: /(\w{3}\s*\d{1,2})\s*(\d{1,2})(\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/\s+/g, ' ').trim(),
                    time: `${match[2]}:${match[3]} ${match[4]}`
                })
            },
            // Formato con errores comunes: Nov 6+ 10:G0 PM (donde G es 0)
            {
                regex: /(\w{3}\s*[+.]\s*\d{1,2})\s*[-–]\s*(\d{1,2})[G:](\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => ({
                    date: match[1].replace(/[+.]/g, ' ').replace(/\s+/g, ' ').trim(),
                    time: `${match[2]}:0${match[3]} ${match[4]}`
                })
            },
            // Formato con errores comunes: Nov 6+ 157 PM (donde 157 es 1:57)
            {
                regex: /(\w{3}\s*[+.]\s*\d{1,2})\s*[-–]\s*(\d{1,2})(\d{2})\s*(AM|PM|am|pm)/gi,
                process: (match) => {
                    // Determinar si es formato de 3 o 4 dígitos
                    const timeStr = match[2] + match[3];
                    let hour, minute;
                    
                    if (timeStr.length === 3) {
                        // Formato 157 -> 1:57
                        hour = timeStr.substring(0, 1);
                        minute = timeStr.substring(1);
                    } else {
                        // Formato 1557 -> 15:57 o 3:57 PM
                        hour = timeStr.substring(0, 2);
                        minute = timeStr.substring(2);
                    }
                    
                    return {
                        date: match[1].replace(/[+.]/g, ' ').replace(/\s+/g, ' ').trim(),
                        time: `${hour}:${minute} ${match[4]}`
                    };
                }
            }
        ];
        
        // Probar cada patrón en la línea actual
        patterns.forEach(pattern => {
            const matches = [...line.matchAll(pattern.regex)];
            matches.forEach(match => {
                const processed = pattern.process(match);
                if (processed && processed.date && processed.time) {
                    detailsArray.push({
                        tripDate: processed.date,
                        tripTime: processed.time,
                        originalLine: line // Guardar la línea original para referencia
                    });
                }
            });
        });
    });
    
    // Eliminar duplicados basados en fecha y hora
    const uniqueDetails = [];
    const seen = new Set();
    
    detailsArray.forEach(detail => {
        const key = `${detail.tripDate}-${detail.tripTime}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueDetails.push(detail);
        }
    });
    
    // Ordenar por fecha y hora para asegurar consistencia
    uniqueDetails.sort((a, b) => {
        // Extraer día del mes para comparar
        const dayA = parseInt(a.tripDate.match(/\d+/)[0]);
        const dayB = parseInt(b.tripDate.match(/\d+/)[0]);
        
        if (dayA !== dayB) {
            return dayB - dayA; // Ordenar descendente por día (más reciente primero)
        }
        
        // Si mismo día, ordenar por hora
        return convertTimeToMinutes(b.tripTime) - convertTimeToMinutes(a.tripTime);
    });
    
    return uniqueDetails;
}








// Función auxiliar para convertir tiempo a minutos
function convertTimeToMinutes(timeStr) {
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
}




// Modificación en processImageFile para mejorar la asignación de fechas/horas
function processImageFile(file, fileItem) {
    const fileReader = new FileReader();
    fileReader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const processedImgSrc = preprocessImage(img);
            
            const progressBar = fileItem.querySelector('.progress'); 
            const fileStatus = fileItem.querySelector('.file-status');
            Tesseract.recognize(processedImgSrc, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        progressBar.style.width = `${progress}%`;
                        fileStatus.textContent = `Processing... ${progress}%`;
                    }
                }
            })
            .then(({ data: { text } }) => {
                console.log("Raw OCR Text:", text);
                
                // NUEVO: Extraer todas las fechas y horas del texto de la imagen
                const allImageTripDetails = extractImageTripDetails(text);
                console.log("All extracted dates/times from image:", allImageTripDetails);
                
                // --- NUEVO: Usar LLM para estructurar los datos ---
                // Mostrar estado de procesamiento de la API
                apiStatus.style.display = 'block';
                apiStatus.className = 'api-status processing';
                apiStatus.textContent = 'Processing with AI...';
                
                extractTripsWithLLM(text)
                    .then(trips => {
                        console.log("Structured Data from LLM:", trips);
                        
                        // Ocultar estado de procesamiento
                        apiStatus.style.display = 'none';
                        
                        const fileDetails = document.createElement('div'); 
                        fileDetails.className = 'file-details'; 
                        fileDetails.textContent = `${trips.length} trip(s) found.`; 
                        fileItem.appendChild(fileDetails);
                        
                        let validTripsFound = 0;
                        trips.forEach((trip, index) => {
                            const validationResult = validateTrip(trip, 'image');
                            if (validationResult.isValid) validTripsFound++;
                            
                            // NUEVO: Intentar asociar cada viaje con su fecha/hora más cercana
                            let tripDetail = null;
                            
                            // Si tenemos suficientes detalles para todos los viajes
                            if (allImageTripDetails.length >= trips.length) {
                                tripDetail = allImageTripDetails[index];
                            } else if (allImageTripDetails.length > 0) {
                                // Si tenemos menos detalles que viajes, intentamos asociar por destino
                                tripDetail = findBestMatchForTrip(trip, allImageTripDetails, text);
                            }
                            
                            // Mostrar en consola los detalles de cada viaje encontrado en la imagen
                            if (tripDetail) {
                                console.log(`=== IMAGE TRIP DETAILS [${file.name} - Trip ${index + 1}] ===`);
                                console.log(`Trip Date: ${tripDetail.tripDate}`);
                                console.log(`Trip Time: ${tripDetail.tripTime}`);
                                console.log(`Destination: ${trip.destination}`);
                                console.log(`================================================`);
                            } else {
                                console.warn(`Could not extract date/time for trip ${index + 1} in ${file.name}`);
                            }
                            
                            // Guardar los detalles extraídos en el objeto del viaje
                            trip.tripDate = tripDetail ? tripDetail.tripDate : 'Not found';
                            trip.tripTime = tripDetail ? tripDetail.tripTime : 'Not found';
                            
                            fileResults.push({ 
                                name: file.name, 
                                type: 'image', 
                                total: trip.total_lkr, 
                                origin: trip.origin || 'Not specified', 
                                destination: trip.destination, 
                                isValid: validationResult.isValid, 
                                validationDetails: validationResult.details, 
                                text: text,
                                tripTime: trip.trip_time || trip.tripTime || null // Usar la hora extraída si está disponible
                                // NO se añade tripDate para imágenes
                            });
                        });
                        fileItem.className = validTripsFound > 0 ? 'file-item success' : 'file-item invalid';
                        fileStatus.className = `file-status ${validTripsFound > 0 ? 'status-success' : 'status-invalid'}`;
                        fileStatus.textContent = `Completed (${validTripsFound} valid)`;
                        progressBar.style.display = 'none';
                        updateResultsTable();
                    })
                    .catch(error => {
                        console.error('Error processing with LLM:', error);
                        
                        // Mostrar estado de error
                        apiStatus.className = 'api-status error';
                        apiStatus.textContent = `Error processing with AI: ${error.message}`;
                        
                        fileItem.className = 'file-item error';
                        fileStatus.className = 'file-status status-error';
                        fileStatus.textContent = 'Error processing with AI';
                        progressBar.style.display = 'none';
                    });
            }).catch(err => { 
                console.error('Error processing image:', err); 
                fileItem.className = 'file-item error'; 
                fileStatus.className = 'file-status status-error'; 
                fileStatus.textContent = 'Error processing'; 
                progressBar.style.display = 'none'; 
            });
        };
        img.src = e.target.result;
    };
    fileReader.readAsDataURL(file);
}

function findBestMatchForTrip(trip, allImageTripDetails, text) {
    // Buscar el destino en el texto para encontrar la fecha/hora más cercana
    const destination = trip.destination.toLowerCase();
    const lines = text.split('\n');
    
    let bestMatch = null;
    let minDistance = Infinity;
    
    allImageTripDetails.forEach(detail => {
        // Buscar la línea que contiene la fecha/hora
        const timeLine = lines.find(line => 
            line.includes(detail.tripDate) && 
            line.includes(detail.tripTime)
        );
        
        if (timeLine) {
            // Buscar la línea que contiene el destino
            const destLine = lines.find(line => 
                line.toLowerCase().includes(destination.substring(0, 10)) // Usar solo parte del destino para evitar errores
            );
            
            if (destLine) {
                // Calcular la distancia entre las líneas
                const timeIndex = lines.indexOf(timeLine);
                const destIndex = lines.indexOf(destLine);
                const distance = Math.abs(timeIndex - destIndex);
                
                // Si esta distancia es menor que la mejor encontrada hasta ahora
                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = detail;
                }
            }
        }
    });
    
    return bestMatch;
}

// ... (mantener el resto del código sin cambios)






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
// Supongamos que 'rawOcrText' es el texto completo que te da Tesseract.
async function extractTripsWithLLM(rawOcrText) {
    console.log("🚀 Iniciando Nuevo Parser Híbrido (Segmentar + Extraer)...");

    // --- PASO 1: SEGMENTACIÓN ---
    console.log("✂️ [SEGMENTACIÓN] Dividiendo el texto en trozos de viaje...");
    
    // Limpiamos el texto para que la segmentación sea más robusta
    const cleanedText = rawOcrText.replace(/\n\s*\n/g, '\n').trim();
    
    // Usamos "Rebook" como delimitador. La 'i' lo hace insensible a mayúsculas/minúsculas.
    const tripChunks = cleanedText.split(/Rebook/i);
    
    // Filtramos los trozos para eliminar basura y quedarnos solo con los que parecen viajes válidos
    const potentialTrips = tripChunks
        .map(chunk => chunk.trim()) // Quitamos espacios en blanco al inicio y final
        .filter(chunk => chunk.length > 20); // Ignoramos trozos muy cortos

    console.log(`🔍 [SEGMENTACIÓN] Se encontraron ${potentialTrips.length} trozos de viaje potenciales.`);
    console.log(potentialTrips);


    // --- PASO 2: EXTRACCIÓN FOCALIZADA CON LLAMA ---
    const structuredTrips = [];
    const promptTemplate = `
Eres un experto en extracción de datos. Analiza el siguiente texto, que corresponde a una línea de un recibo de viaje, y extrae la información clave.

El texto puede tener errores de OCR, símbolos extraños o falta de formato. Tu tarea es inferir la información correcta.

Texto de entrada:
"""
{TRIP_CHUNK}
"""

Devuelve ÚNICAMENTE un objeto JSON con las siguientes claves:
- "destination": El nombre del lugar (ej. "Mireka Tower", "43b Lauries Rd"). Si no se encuentra, pon null.
- "date": La fecha del viaje en formato "Month Day" (ej. "Nov 8"). Si no se encuentra, pon null.
- "time": La hora del viaje en formato "H:MM AM/PM" (ej. "7:57 PM", "12:42 PM"). Corrige errores comunes como "8718 PM" a "8:18 PM" o "558 PM" a "5:58 PM". Si no se encuentra, pon null.

Ejemplo de salida JSON:
{ "destination": "Get UFit Gym", "date": "Nov 8", "time": "7:18 PM" }
`;

    // Iteramos sobre cada trozo y hacemos una llamada a Llama para cada uno
    for (const chunk of potentialTrips) {
        console.log(`🤖 [LLM] Enviando a Llama el trozo: "${chunk.substring(0, 50)}..."`);
        
        // Inyectamos el trozo actual en nuestro prompt
        const finalPrompt = promptTemplate.replace("{TRIP_CHUNK}", chunk);

        try {
            // --- AQUÍ VA TU LLAMADA EXISTENTE A LLAMA ---
            // Adapta esta parte a cómo llamas a tu API actualmente.
            // Simulo una respuesta de tu API.
            const responseFromLLM = await callYourLlamaAPI(finalPrompt); 

            // Intentamos parsear la respuesta a JSON
            const tripData = JSON.parse(responseFromLLM);
            structuredTrips.push(tripData);
            console.log("✅ [LLM] Respuesta recibida y parseada:", tripData);

        } catch (error) {
            console.error("❌ [LLM] Error al procesar un trozo con Llama:", error);
            // Opcionalmente, podrías añadir un objeto de error para no perder el viaje
            structuredTrips.push({ destination: null, date: null, time: null, error: true });
        }
    }

    // --- PASO 3: UNIÓN Y RETORNO ---
    console.log("🏁 [FINAL] Proceso completado. Datos estructurados finales:", structuredTrips);
    return structuredTrips;
}

// --- FUNCIÓN SIMULADA DE TU API ---
// REEMPLAZA ESTA FUNCIÓN CON TU LLAMADA REAL A LA API DE LLAMA
async function callYourLlamaAPI(prompt) {
    console.log("-> Llamando a la API de Llama con el prompt...");
    
    // Aquí iría tu fetch() o axios.post() a tu endpoint en Vercel.
    // const response = await fetch('TU_ENDPOINT_VERCEL', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ prompt: prompt })
    // });
    // const data = await response.json();
    // return data.output; // O como sea que tu API devuelva el texto.

    // --- SIMULACIÓN PARA PRUEBAS ---
    // Simulo que Llama responde correctamente para un par de ejemplos.
    if (prompt.includes("Mireka Tower")) {
        return JSON.stringify({ destination: "Mireka Tower", date: "Nov 9", time: "12:42 PM" });
    }
    if (prompt.includes("Lauries Rd")) {
        return JSON.stringify({ destination: "43b Lauries Rd", date: "Nov 8", time: "7:57 PM" });
    }
    if (prompt.includes("Get UFit Gym")) {
        return JSON.stringify({ destination: "Get UFit Gym", date: "Nov 8", time: "7:18 PM" }); // Corrige 8718 PM
    }
    return JSON.stringify({ destination: null, date: null, time: null });
}

// --- CÓMO USARLA ---
// En el lugar donde procesas la imagen, después de obtener el texto de Tesseract:
// const rawOcrText = "7:409 B ol 4G..."; // Todo el texto del OCR
// extractTripsWithNewHybridApproach(rawOcrText);

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

    const cleanedText = rawDestination.toLowerCase().trim();

    // Lista blanca de destinos conocidos y sus nombres limpios
    const knownDestinations = {
        'mireka tower': 'Mireka Tower',
        '43b lauries rd': '43b Lauries Rd',
        '43d lauries rd': '43d Lauries Rd',
        'colombo 00400': 'Colombo 00400',
        'seylan bank': 'Seylan Bank',
        'ar exotics': 'AR Exotics Marine',
        'get u fit': 'Get U Fit Gym',
        'keells': 'Keells - Lauries',
        'jungle juice': 'Jungle Juice Bar'
    };

    // Busca si el texto sucio contiene alguno de nuestros destinos conocidos
    for (const keyword in knownDestinations) {
        if (cleanedText.includes(keyword)) {
            return knownDestinations[keyword];
        }
    }

    // Si no se encuentra en la lista blanca, devuelve el texto original.
    // La validación posterior se encargará de marcarlo como inválido.
    console.warn(`⚠️ No se pudo limpiar el destino: "${rawDestination}"`);
    return rawDestination.trim();
}

/**
 * --- FUNCIÓN AUXILIAR: El parser de JavaScript ---
 * Usa regex para encontrar precios y luego lee hacia atrás para encontrar el destino.
 */
function parseTripsWithJS(text) {
    const trips = [];
    const lines = text.split('\n');
    const priceRegex = /LKR\s*([0-9QOA.]+)/i;
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
        let total_lkr = priceMatch[1].replace(/Q|O/g, '0').replace(/A/g, '4');

        let status = 'valid';
        if (priceLine.toLowerCase().includes('canceled')) {
            status = 'valid';
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

/**
 * --- FUNCIÓN AUXILIAR: El fallback a la IA (simplificado) ---
 * Solo se llama si el parser JS falló.
 */
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

        const llmResponse = data.message;
        console.log("--- Respuesta del Fallback a la IA ---");
        console.log(llmResponse);

        let tripsData = [];
        try {
            const stringArray = JSON.parse(llmResponse);
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
        } catch (e) {
            console.error("❌ El fallback de la IA también falló.");
            throw new Error('Both JS parser and LLM fallback failed.');
        }
        
        return tripsData;

    } catch (error) {
        console.error('Error en el fallback a la IA:', error);
        throw error;
    }
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
    if(!totalMatch){
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
            const validPatterns = [ /^43b/, /^43d/, /^mireka/ ];
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
            const staticValidDestinations = [ 'colombo 00400' ];
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
    resultsContainer.style.display = 'block';
    resultsBody.innerHTML = '';
    let totalSum = 0;
    let validCount = 0;
    let invalidCount = 0;
    fileResults.forEach((result, index) => {
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
        viewBtn.onclick = function() {
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
            totalSum += parseFloat(result.total.replace(',', '.'));
        }
        
        if (result.isValid) {
            validCount++;
        } else {
            invalidCount++;
        }
    });
    summary.innerHTML = `<p>Total files processed: ${fileResults.length}</p><p>Valid trips: ${validCount}</p><p>Invalid trips: ${invalidCount}</p><p>Total LKR sum (valid trips): ${totalSum.toFixed(2)} LKR</p>`;

    updateTripCalendar();//estamos actualizando esto, antes "updateTripChart();"
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

closeChartBtn.onclick = () => chartModal.style.display = 'none';
window.onclick = (event) => {
    if (event.target == chartModal) chartModal.style.display = 'none';
};

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
        }
    }
    
    calendarTable.appendChild(tableBody);
    
    // 10. Limpiar y actualizar el contenedor del calendario
    calendarContainer.innerHTML = '';
    calendarContainer.appendChild(calendarHeader);
    calendarContainer.appendChild(calendarTable);
}