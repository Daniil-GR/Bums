### Bums V2 #bums

## ⚙️ Инструкция:

# Установите Node.js: https://nodejs.org/en/

• После установки проверьте, что Node.js работает, запустив в терминале команду:
```
node -v
```
• Вы также должны увидеть версию npm (менеджера пакетов для Node.js), введя:
```
npm -v
```

2/ Установите необходимые библиотеки:
```
npm install axios md5 form-data
```

3/ Запустите скрипт:
```
node bums.js
```
или, если используете прокси:
```
node bums-proxy.js
```
4/ Вставьте query_id или user_id в файл data.txt

5/ Используя прокси, вставьте его в файл proxy.txt в формате: http://login:pass@ip:port
