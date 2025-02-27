const fs = require("fs");
const colors = require("colors");
const { DateTime } = require("luxon");
const path = require("path");

require("dotenv").config();

// Функция для проверки, является ли объект массивом
function _isArray(obj) {
  if (Array.isArray(obj) && obj.length > 0) {
    return true;
  }

  try {
    const parsedObj = JSON.parse(obj);
    return Array.isArray(parsedObj) && parsedObj.length > 0;
  } catch (e) {
    return false;
  }
}

// Функция для обновления переменных среды
const envFilePath = path.join(__dirname, ".env");
function updateEnv(variable, value) {
  // Чтение файла .env
  fs.readFile(envFilePath, "utf8", (err, data) => {
    if (err) {
      console.log("Не удалось прочитать файл .env:", err);
      return;
    }
    // Создание или обновление переменной в файле
    const regex = new RegExp(`^${variable}=.*`, "m");
    const newData = data.replace(regex, `${variable}=${value}`);

    // Проверка, если переменная не существует, добавляем её в конец
    if (!regex.test(data)) {
      newData += `\n${variable}=${value}`;
    }

    // Перезапись файла .env
    fs.writeFile(envFilePath, newData, "utf8", (err) => {
      if (err) {
        console.error("Не удалось записать файл .env:", err);
      } else {
        console.log(`Обновлена переменная ${variable}: ${value}`);
      }
    });
  });
}

// Функция для паузы (задержки)
function sleep(seconds = null) {
  if (seconds && typeof seconds === "number") return new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  let DELAY_BETWEEN_REQUESTS = process.env.DELAY_BETWEEN_REQUESTS && _isArray(process.env.DELAY_BETWEEN_REQUESTS) ? JSON.parse(process.env.DELAY_BETWEEN_REQUESTS) : [1, 5];
  if (seconds && Array.isArray(seconds)) {
    DELAY_BETWEEN_REQUESTS = seconds;
  }
  const min = DELAY_BETWEEN_REQUESTS[0];
  const max = DELAY_BETWEEN_REQUESTS[1];

  return new Promise((resolve) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    setTimeout(resolve, delay * 1000);
  });
}

// Функция сохранения токена
function saveToken(id, token) {
  const tokens = JSON.parse(fs.readFileSync("token.json", "utf8"));
  tokens[id] = token;
  fs.writeFileSync("token.json", JSON.stringify(tokens, null, 4));
}

// Функция получения токена
function getToken(id) {
  const tokens = JSON.parse(fs.readFileSync("token.json", "utf8"));
  return tokens[id] || null;
}

// Проверка истечения срока действия токена
function isExpiredToken(token) {
  const [header, payload, sign] = token.split(".");
  const decodedPayload = Buffer.from(payload, "base64").toString();

  try {
    const parsedPayload = JSON.parse(decodedPayload);
    const now = Math.floor(DateTime.now().toSeconds());

    if (parsedPayload.exp) {
      const expirationDate = DateTime.fromSeconds(parsedPayload.exp).toLocal();
      log(colors.cyan(`Токен истекает: ${expirationDate.toFormat("yyyy-MM-dd HH:mm:ss")}`));
      const isExpired = now > parsedPayload.exp;
      log(colors.cyan(`Токен истёк? ${isExpired ? "Да, требуется обновление токена" : "Нет, всё работает"}`));
      return isExpired;
    } else {
      log(colors.yellow("Вечный токен: невозможно определить срок действия"));
      return false;
    }
  } catch (error) {
    log(colors.red(`Ошибка: ${error.message}`));
    return true;
  }
}

// Генерация случайного хэша
function generateRandomHash() {
  const characters = "0123456789abcdef";
  let hash = "0x"; // Начинается с "0x"

  for (let i = 0; i < 64; i++) {
    // 64 символа для хэша
    const randomIndex = Math.floor(Math.random() * characters.length);
    hash += characters[randomIndex];
  }

  return hash;
}

// Выбор случайного элемента из массива
function getRandomElement(arr) {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}

// Генерация случайного числа
function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

// Загрузка данных из файла
function loadData(file) {
  try {
    const datas = fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
    if (datas?.length <= 0) {
      console.log(colors.red(`Данные в файле ${file} не найдены`));
      process.exit();
    }
    return datas;
  } catch (error) {
    console.log(`Файл ${file} не найден`.red);
  }
}

// Сохранение данных в файл
async function saveData(data, filename) {
  fs.writeFileSync(filename, data.join("\n"));
}

// Функция логирования
function log(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  switch (type) {
    case "success":
      console.log(`[${timestamp}] [*] ${msg}`.green);
      break;
    case "custom":
      console.log(`[${timestamp}] [*] ${msg}`.magenta);
      break;
    case "error":
      console.log(`[${timestamp}] [!] ${msg}`.red);
      break;
    case "warning":
      console.log(`[${timestamp}] [*] ${msg}`.yellow);
      break;
    default:
      console.log(`[${timestamp}] [*] ${msg}`.blue);
  }
}

// Сохранение элемента в файл JSON
function saveItem(id, value, filename) {
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  data[id] = value;
  fs.writeFileSync(filename, JSON.stringify(data, null, 4));
}

// Получение элемента из файла JSON
function getItem(id, filename) {
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  return data[id] || null;
}

// Получение или создание элемента в JSON
function getOrCreateJSON(id, value, filename) {
  let item = getItem(id, filename);
  if (item) {
    return item;
  }
  saveItem(id, value, filename);
  return item;
}

// Экспорт функций
module.exports = { _isArray, getRandomNumber, updateEnv, saveToken, getToken, isExpiredToken, generateRandomHash, getRandomElement, loadData, saveData, log, getOrCreateJSON, sleep };
