// Подключаем встроенные модули
const fs = require('fs');
const path = require('path');

// --- НАСТРОЙКИ ---
// Убрали префикс, остались только необходимые настройки
const numberOfCodes = 100000000;
const codeLength = 6;
const outputFileName = 'codesGenerated.txt';
// --- КОНЕЦ НАСТРОЕК ---

function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars.charAt(randomIndex);
    }
    return result;
}

function main() {
    console.log(`Начинаю генерацию ${numberOfCodes.toLocaleString('ru-RU')} кодов...`);
    const startTime = Date.now();
    const outputPath = path.join(__dirname, outputFileName);
    const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });

    let i = 0; // Выносим счетчик за пределы функции

    // Создаем функцию, которая будет заниматься записью
    function write() {
        let canWrite = true;
        // Запускаем цикл, который работает, пока i не достигнет нужного числа
        // и пока поток готов принимать данные (canWrite === true)
        while (i < numberOfCodes && canWrite) {
            // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
            // Генерируем только случайную часть и добавляем перенос строки
            const codeLine = `${generateRandomString(codeLength)}\n`;

            i++;

            // Обновляем индикатор прогресса
            if (i % 100000 === 0) {
                const percent = ((i / numberOfCodes) * 100).toFixed(2);
                process.stdout.write(`\rПрогресс: ${percent}%... Сгенерировано ${i.toLocaleString('ru-RU')} кодов.`);
            }
            
            // Если это последняя порция данных, используем end() вместо write()
            if (i === numberOfCodes) {
                writeStream.end(codeLine); // Записываем последнюю строку и закрываем поток
            } else {
                // write() вернет false, если внутренний буфер переполнен
                canWrite = writeStream.write(codeLine);
            }
        }

        // Если цикл остановился из-за того, что буфер переполнен (canWrite === false),
        // мы ждем сигнала 'drain', чтобы продолжить.
        if (i < numberOfCodes) {
            writeStream.once('drain', write);
        }
    }
    
    // Запускаем процесс в первый раз
    write();

    // Обработчик события 'finish' - сработает, когда поток будет полностью закрыт
    writeStream.on('finish', () => {
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`\n\x1b[32m%s\x1b[0m`, `Успешно! Все коды сгенерированы.`);
        console.log(`Результат сохранен в файле: ${outputPath}`);
        console.log(`Время выполнения: ${duration} сек.`);
    });
    
    // Обработчик ошибок
    writeStream.on('error', (error) => {
        console.error('\x1b[31m%s\x1b[0m', '\nПроизошла ошибка при записи в файл:');
        console.error(error);
    });
}

main();