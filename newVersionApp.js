const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit').default;
const readline = require('readline');

// --- ОСНОВНЫЕ НАСТРОЙКИ ---
const PREFIX = 'Aethir';
const BASE_API_URL = 'https://nhiymxlnmxrvcefwpdbg.supabase.co/rest/v1/community_passwords';
const CODE_PARAMETER_NAME = 'password';
const CODES_FILE_NAME = 'all_codes_go_parallel.txt';
const RESULTS_FILE_NAME = 'result.txt';
const BATCH_SIZE = 950;
const CONCURRENCY_LIMIT = 120; // ИЗМЕНЕНО согласно запросу
const HIGH_WATER_MARK = CONCURRENCY_LIMIT * 2;
const PROGRESS_INTERVAL_MS = 10000; // 10 секунд

// --- НОВАЯ НАСТРОЙКА ПЕРЕЗАПУСКА ---
// Установите 1 для обычного запуска с самого начала.
// Для перезапуска укажите номер пакета, с которого нужно продолжить.
const START_FROM_BATCH = 925359; // <-- ИЗМЕНИТЬ ЗДЕСЬ ДЛЯ ПЕРЕЗАПУСКА

async function checkCodeBatch(batch, batchNum) {
    const filterValue = `in.(${batch.join(',')})`;
    try {
        const params = { select: 'id,max_uses,current_uses,active,password', [CODE_PARAMETER_NAME]: filterValue, active: 'eq.true' };
        const headers = { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXlteGxubXhydmNlZndwZGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjMyNzMsImV4cCI6MjA2NDA5OTI3M30.joedN9gZhp4sxCXOCC5Xe7wHCg-uod683Qh84D78NO8', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXlteGxubXhydmNlZndwZGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjMyNzMsImV4cCI6MjA2NDA5OTI3M30.joedN9gZhp4sxCXOCC5Xe7wHCg-uod683Qh84D78NO8', 'Accept': 'application/json', 'Origin': 'https://fremenessence.gaib.ai', 'Referer': 'https://fremenessence.gaib.ai/' };
        
        console.log(`[Пакет ${batchNum}] Отправляем ${batch.length} кодов... (Активно: ${limit.activeCount}, В очереди: ${limit.pendingCount})`);
        const response = await axios.get(BASE_API_URL, { params, headers, timeout: 60000 });
        
        return { status: 'success', validCodes: response.data, batchNum };
    } catch (error) {
        let errorMessage = `[Пакет ${batchNum}] ❗️ Ошибка: `;
        if (error.code) errorMessage += `${error.code} `;
        if (error.response) errorMessage += `API Error ${error.response.status}`;
        else if (error.request) errorMessage += 'Network Error / Timeout';
        else errorMessage += error.message;

        return { status: 'exception', message: errorMessage, batchNum };
    }
}

function processAndLogResult(result, writeStream, stats) {
    if (result.status === 'success') {
        stats.successfulBatches++;
        if (result.validCodes.length > 0) {
            stats.totalValidCount += result.validCodes.length;
            console.log(`[Пакет ${result.batchNum}] ✅ Успех! Найдено ВАЛИДНЫХ кодов: ${result.validCodes.length} шт.`);
            const logData = result.validCodes.map(item => `[${new Date().toLocaleTimeString('uk-UA')}] Код: ${item.password.padEnd(15)} | Статус: valid | Данные: ${JSON.stringify(item)}`).join('\n');
            writeStream.write(logData + '\n');
        }
    } else {
        stats.failedBatches++;
        console.error(result.message);
        writeStream.write(`[${new Date().toLocaleTimeString('uk-UA')}] ${result.message}\n`);
    }
}

const limit = pLimit(CONCURRENCY_LIMIT);

async function main() {
    console.log("Запуск скрипта...");
    if (PREFIX) {
        console.log(`Используется префикс для всех кодов: "${PREFIX}-"`);
    }

    const codesFilePath = path.join(__dirname, CODES_FILE_NAME);
    if (!fs.existsSync(codesFilePath)) {
        console.error(`Ошибка: Файл с кодами '${CODES_FILE_NAME}' не найден.`);
        return;
    }
    
    const totalLines = 56800000000;
    console.log(`Общее количество кодов для проверки установлено: ${totalLines.toLocaleString('ru-RU')}`);

    const resultsFilePath = path.join(__dirname, RESULTS_FILE_NAME);
    const resultsStream = fs.createWriteStream(resultsFilePath, { flags: 'a' });
    resultsStream.write(`--- Запуск/перезапуск проверки: ${new Date().toLocaleString('uk-UA')} ---\n`);
    
    console.log(`Размер пакета: ${BATCH_SIZE}, Лимит одновременных запросов: ${CONCURRENCY_LIMIT}`);
    
    // --- ИЗМЕНЕНИЕ: Логика перезапуска ---
    const linesToSkip = START_FROM_BATCH > 1 ? (START_FROM_BATCH - 1) * BATCH_SIZE : 0;
    let batchNum = START_FROM_BATCH;
    const stats = { totalValidCount: 0, linesRead: linesToSkip, successfulBatches: 0, failedBatches: 0 };
    
    const fileStream = fs.createReadStream(codesFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let batch = [];
    let isPaused = false;
    let progressInterval;
    let lineCounterForSkip = 0;
    let skippingPhaseDone = linesToSkip === 0;

    if (linesToSkip > 0) {
        console.log(`\n--- РЕЖИМ ПЕРЕЗАПУСКА АКТИВИРОВАН ---`);
        console.log(`Начинаем с пакета №${START_FROM_BATCH.toLocaleString('ru-RU')}.`);
        console.log(`Требуется пропустить ${linesToSkip.toLocaleString('ru-RU')} строк. Это может занять время...`);
    }
    
    progressInterval = setInterval(() => {
        const percentage = totalLines > 0 ? ((stats.linesRead / totalLines) * 100).toFixed(8) : "N/A";
        console.log(
            `\n[ПРОГРЕСС | ${new Date().toLocaleTimeString('uk-UA')}] Обработано: ${stats.linesRead.toLocaleString('ru-RU')}/${totalLines.toLocaleString('ru-RU')} (${percentage}%) | Найдено: ${stats.totalValidCount} | Запросы (Активно/В очереди): ${limit.activeCount}/${limit.pendingCount}\n`
        );
    }, PROGRESS_INTERVAL_MS);

    await new Promise((resolve, reject) => {
        rl.on('line', (line) => {
            // --- ИЗМЕНЕНИЕ: Фаза пропуска строк ---
            if (lineCounterForSkip < linesToSkip) {
                lineCounterForSkip++;
                if (lineCounterForSkip % 1000000 === 0) { // Логируем прогресс пропуска
                    console.log(`[Пропуск...] Прочитано ${lineCounterForSkip.toLocaleString('ru-RU')} из ${linesToSkip.toLocaleString('ru-RU')} строк...`);
                }
                return;
            }
            
            if (!skippingPhaseDone) {
                console.log(`\n--- ПРОПУСК СТРОК ЗАВЕРШЕН ---`);
                console.log(`Начинаем обработку с пакета №${batchNum.toLocaleString('ru-RU')}.\n`);
                skippingPhaseDone = true;
            }
            // --- Конец фазы пропуска ---

            stats.linesRead++;
            const rawCode = line.trim();

            if (rawCode) {
                const finalCode = PREFIX ? `${PREFIX}-${rawCode}` : rawCode;
                batch.push(finalCode);
            }
            
            if (batch.length >= BATCH_SIZE) {
                const currentBatch = batch;
                
                limit(async () => {
                    const result = await checkCodeBatch(currentBatch, batchNum);
                    processAndLogResult(result, resultsStream, stats);
                }).then(() => {
                    if (isPaused && limit.pendingCount < CONCURRENCY_LIMIT) {
                        isPaused = false;
                        rl.resume();
                    }
                });

                batch = []; 
                batchNum++;

                if (!isPaused && limit.pendingCount > HIGH_WATER_MARK) {
                    isPaused = true;
                    rl.pause();
                }
            }
        });

        rl.on('close', () => {
            if (batch.length > 0) {
                 limit(async () => {
                    const result = await checkCodeBatch(batch, batchNum);
                    processAndLogResult(result, resultsStream, stats);
                });
            }
            console.log(`Чтение файла завершено. Всего прочитано строк: ${stats.linesRead.toLocaleString('ru-RU')}. Ожидаем завершения всех сетевых запросов...`);
            resolve();
        });

        rl.on('error', (err) => {
            clearInterval(progressInterval);
            reject(err);
        });
    });

    await limit.onIdle();
    
    clearInterval(progressInterval);

    resultsStream.end();

    console.log('\n\n--- Проверка завершена ---');
    console.log(`Обработка ${stats.linesRead.toLocaleString('ru-RU')} строк завершена.`);
    console.log(`Успешных пакетов: ${stats.successfulBatches}, Пакетов с ошибками: ${stats.failedBatches}`);
    console.log(`Найдено ВСЕГО валидных кодов: ${stats.totalValidCount}`);
    console.log(`\nВсе подробные результаты сохранены в файле '${RESULTS_FILE_NAME}'.`);
}

main().catch(err => console.error("Критическая ошибка:", err));