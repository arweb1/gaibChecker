// Подключаем встроенный модуль 'fs' для работы с файловой системой
const fs = require('fs');
// Подключаем встроенный модуль 'path' для корректной работы с путями к файлам
const path = require('path');

// --- НАСТРОЙКИ ---
// Задайте ваше слово-префикс здесь
const prefix = 'CN';

// Укажите, сколько кодов нужно сгенерировать
const numberOfCodes = 10000;

// Длина случайной части кода
const randomPartLength = 6;

// Название файла для сохранения результата
const outputFileName = 'codesGenerated.txt';
// --- КОНЕЦ НАСТРОЕК ---


/**
 * Генерирует случайную строку заданной длины.
 * @param {number} length - Длина генерируемой строки.
 * @returns {string} - Случайная строка.
 */
function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars.charAt(randomIndex);
    }
    return result;
}

/**
 * Основная функция для генерации и сохранения кодов.
 */
function main() {
    console.log('Начинаю генерацию кодов...');

    try {
        const codes = []; // Массив для хранения всех сгенерированных кодов

        for (let i = 0; i < numberOfCodes; i++) {
            // Генерируем случайную часть
            const randomPart = generateRandomString(randomPartLength);
            // Собираем полный код в нужном формате
            const fullCode = `${prefix}-${randomPart}`;
            // Добавляем готовый код в массив
            codes.push(fullCode);
        }

        // Превращаем массив кодов в одну большую строку, где каждый код на новой строке
        const fileContent = codes.join('\n');

        // Определяем полный путь к файлу, чтобы он сохранился в той же папке, где лежит скрипт
        const outputPath = path.join(__dirname, outputFileName);

        // Записываем все коды в файл. Если файл уже существует, он будет перезаписан.
        fs.writeFileSync(outputPath, fileContent);

        console.log(`\x1b[32m%s\x1b[0m`, `Успешно! Сгенерировано ${numberOfCodes} кодов.`);
        console.log(`Результат сохранен в файле: ${outputPath}`);

    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'Произошла ошибка во время выполнения скрипта:');
        console.error(error);
    }
}

// Запускаем основную функцию
main();