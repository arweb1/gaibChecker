package main

import (
	"fmt"
	"math/big"
	"os"
	"strings"
	"sync"
	"time"
	"runtime"
)

const (
	characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	codeLength = 6
)

var base = big.NewInt(int64(len(characters)))

func generateCode(val *big.Int) string {
	code := make([]byte, codeLength)
	tempVal := new(big.Int).Set(val)

	remainder := new(big.Int)
	for i := codeLength - 1; i >= 0; i-- {
		remainder.Mod(tempVal, base)
		code[i] = characters[remainder.Int64()]

		tempVal.Div(tempVal, base)
	}
	return string(code)
}

func codeToBigInt(code string) (*big.Int, error) {
	val := big.NewInt(0)
	for _, r := range code {
		idx := strings.IndexRune(characters, r)
		if idx == -1 {
			return nil, fmt.Errorf("недопустимый символ в коде: %c", r)
		}
		val.Mul(val, base)
		val.Add(val, big.NewInt(int64(idx)))
	}
	return val, nil
}

func generateRange(startValue *big.Int, count *big.Int, codesChan chan<- string, wg *sync.WaitGroup) {
	defer wg.Done()

	currentValue := new(big.Int).Set(startValue)
	one := big.NewInt(1)
	limit := new(big.Int).Add(startValue, count)

	for currentValue.Cmp(limit) < 0 {
		codesChan <- generateCode(currentValue)
		currentValue.Add(currentValue, one)
	}
}

func generateAndSaveCodesToFile(totalCodesToGenerate *big.Int, startCode, filename string) {
	initialValue := big.NewInt(0)
	if startCode != "000000" {
		parsedVal, err := codeToBigInt(startCode)
		if err != nil {
			fmt.Printf("Ошибка при парсинге начального кода: %v\n", err)
			return
		}
		initialValue = parsedVal
	}

	file, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("Не удалось открыть файл: %v\n", err)
		return
	}
	defer file.Close()

	fmt.Printf("Начинаем запись кодов в файл \"%s\" с кода: %s\n", filename, generateCode(initialValue))

	numGenerators := runtime.NumCPU()
	if numGenerators == 0 {
		numGenerators = 1
	}
	fmt.Printf("Используем %d горутин для параллельной генерации.\n", numGenerators)

	codesChan := make(chan string, 100000)

	var generatorWg sync.WaitGroup
	var writerWg sync.WaitGroup

	writerWg.Add(1)
	go func() {
		defer writerWg.Done()
		writtenCount := big.NewInt(0) // Используем big.Int для подсчета записанных кодов
		lastLogTime := time.Now()
		
		// Для вычисления процента:
		totalCodesFloat := new(big.Float).SetInt(totalCodesToGenerate)
		hundred := big.NewFloat(100.0)

		for code := range codesChan {
			_, err := file.WriteString(code + "\n")
			if err != nil {
				fmt.Printf("Ошибка записи в файл: %v\n", err)
			}
			writtenCount.Add(writtenCount, big.NewInt(1)) // Инкремент счётчика

			// Логирование прогресса каждые 1,000,000 записанных кодов
			if new(big.Int).Mod(writtenCount, big.NewInt(1000000)).Cmp(big.NewInt(0)) == 0 {
				elapsedTime := time.Since(lastLogTime).Round(time.Second)
				
				// Вычисление процента
				writtenCountFloat := new(big.Float).SetInt(writtenCount)
				percentage := new(big.Float).Quo(writtenCountFloat, totalCodesFloat)
				percentage.Mul(percentage, hundred)

				fmt.Printf("Записано: %s кодов. Прогресс: %.2f%%. Текущий код: %s (прошло %s с последнего лога)\n", 
				    writtenCount.String(), percentage, code, elapsedTime)
				lastLogTime = time.Now()
			}
		}
	}()

	codesPerGenerator := new(big.Int).Div(totalCodesToGenerate, big.NewInt(int64(numGenerators)))
	remainderCodes := new(big.Int).Mod(totalCodesToGenerate, big.NewInt(int64(numGenerators)))

	currentStart := new(big.Int).Set(initialValue)

	for i := 0; i < numGenerators; i++ {
		generatorWg.Add(1)
		countForThisGenerator := new(big.Int).Set(codesPerGenerator)
		if i == numGenerators-1 {
			countForThisGenerator.Add(countForThisGenerator, remainderCodes)
		}

		startValueForGoRoutine := new(big.Int).Set(currentStart)
		
		go generateRange(startValueForGoRoutine, countForThisGenerator, codesChan, &generatorWg)

		currentStart.Add(currentStart, countForThisGenerator)
	}

	generatorWg.Wait()
	close(codesChan)
	writerWg.Wait()

	finalCodeValue := new(big.Int).Add(initialValue, totalCodesToGenerate)
	fmt.Printf("Завершено. Всего записано %s кодов в файл \"%s\".\n", totalCodesToGenerate.String(), filename)
	fmt.Printf("Следующий код для продолжения: %s\n", generateCode(finalCodeValue))
}

func main() {
	allCombinations := big.NewInt(0)
	allCombinations.Exp(base, big.NewInt(codeLength), nil)

	fmt.Printf("Приступаю к генерации всех %s вариантов кодов...\n", allCombinations.String())
	generateAndSaveCodesToFile(allCombinations, "000000", "all_codes_go_parallel.txt")
}