// API para OCR alternativo con EasyOCR
// Deploy en Vercel: https://vercel.com/docs/concepts/functions

export default async function handler(req, res) {
  // CORS headers COMPLETOS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, HEAD, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    
    console.log('🔍 [EasyOCR] Procesando imagen...');
    
    // Opción 1: Intentar con EasyOCR (si está disponible)
    let ocrText = '';
    try {
      // Importar EasyOCR dinámicamente
      const { createWorker } = await import('tesseract.js');
      
      const worker = await createWorker('eng', 1, {
        logger: m => console.log(`📊 [EasyOCR] ${m.status}: ${Math.round(m.progress * 100)}%`),
      });
      
      const { data: { text } } = await worker.recognize(imageData, {
        // Configuración optimizada para fechas y horas
        tessedit_char_whitelist: '0123456789APMNov+-:. ',
        tessedit_psm_mode: '6', // Single uniform block
        tessedit_ocr_engine_mode: '1', // LSTM only
        preserve_interword_spaces: '1',
      });
      
      ocrText = text;
      await worker.terminate();
      
      console.log('✅ [EasyOCR] Texto extraído:', ocrText);
      
    } catch (easyOcrError) {
      console.log('⚠️ [EasyOCR] No disponible, usando fallback...');
      
      // Opción 2: Fallback con configuración ultra-optimizada
      const { createWorker } = await import('tesseract.js');
      
      const worker = await createWorker('eng', 1, {
        logger: m => console.log(`📊 [Fallback] ${m.status}: ${Math.round(m.progress * 100)}%`),
      });
      
      const { data: { text } } = await worker.recognize(imageData, {
        // Configuración ultra-específica para fechas/horas
        tessedit_char_whitelist: '0123456789APMNov+-:. ',
        tessedit_psm_mode: '7', // Treat the image as a single text line
        tessedit_ocr_engine_mode: '1',
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        tessedit_fix_hyphens: '1',
        tessedit_fix_fuzzy_spaces: '1',
      });
      
      ocrText = text;
      await worker.terminate();
      
      console.log('✅ [Fallback] Texto extraído:', ocrText);
    }
    
    // Extraer específicamente fechas y horas
    const dateTimes = extractDateTimes(ocrText);
    
    console.log('📅 [OCR] Fechas/horas extraídas:', dateTimes);
    console.log(`🔍 [OCR] Total encontradas: ${dateTimes.length}`);
    
    return res.status(200).json({
      success: true,
      text: ocrText,
      dateTimes: dateTimes,
      count: dateTimes.length
    });
    
  } catch (error) {
    console.error('❌ [OCR] Error:', error);
    return res.status(500).json({ 
      error: 'OCR processing failed',
      details: error.message 
    });
  }
}

// Función especializada en extraer fechas y horas
function extractDateTimes(text) {
  const patterns = [
    // Nov9-1242PM
    /(\w{3})(\d{1,2})-(\d{1,2})(\d{2})(AM|PM)/gi,
    // Nov @+ 12:42 PM
    /(\w{3})\s*[@]\s*(\d{1,2})\s*[+:]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi,
    // Nov 8- 7:57 PM
    /(\w{3})\s*(\d{1,2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi,
    // Nov 8718 PM
    /(\w{3})\s*(\d{1})(\d{2})(\d{2})\s*(AM|PM)/gi,
    // Nov 7- 558 PM
    /(\w{3})\s*(\d{1,2})\s*-\s*(\d{1,2})(\d{2})\s*(AM|PM)/gi,
    // Nov 7+ 528 PM
    /(\w{3})\s*(\d{1,2})\s*[+.]\s*(\d{1,2})(\d{2})\s*(AM|PM)/gi,
    // Nov7.448PM
    /(\w{3})[.]?(\d{1,2})[.]?(\d{1,2})(\d{2})(AM|PM)/gi
  ];
  
  const results = [];
  const lines = text.split('\n');
  const processed = new Set();
  
  lines.forEach((line, lineIndex) => {
    patterns.forEach(pattern => {
      const matches = [...line.matchAll(pattern)];
      matches.forEach(match => {
        const key = `${lineIndex}-${match.index}`;
        if (!processed.has(key)) {
          let date, time;
          
          // Procesar según el patrón
          if (match[0].includes('@')) {
            date = `${match[1]} 9`;
            time = `${match[3]}:${match[4]} ${match[5]}`;
          } else if (match[0].match(/\w{3}\d{1,2}-\d{1,2}\d{2}/)) {
            date = `${match[1]} ${match[2]}`;
            time = `${match[3]}:${match[4]} ${match[5]}`;
          } else if (match[0].match(/\w{3}\s*\d{1}\d{2}\d{2}/)) {
            date = `${match[1]} ${match[2]}`;
            time = `${match[3]}:${match[4]} ${match[5]}`;
          } else {
            date = `${match[1]} ${match[2]}`;
            time = `${match[3]}:${match[4]} ${match[5]}`;
          }
          
          results.push({ date, time, original: match[0] });
          processed.add(key);
        }
      });
    });
  });
  
  return results;
}