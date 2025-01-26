const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const { DateTime } = require("luxon");
const md5 = require("md5");
const { HttpsProxyAgent } = require("https-proxy-agent");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber, updateEnv } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

class Bums {
  constructor(queryId, accountIndex, proxy) {
    this.baseUrl = "https://api.bums.bot";
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en",
      // "Content-Type": "multipart/form-data",
      Origin: "https://app.bums.bot",
      Referer: "https://app.bums.bot/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
    };
    this.SECRET_KEY = "7be2a16a82054ee58398c5edb7ac4a5a";
    this.tokenPath = path.join(__dirname, "token.json");
    this.loadProxies();
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Создание user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127"`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      const telegramauth = this.queryId;
      const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
      this.session_name = userData.id;
      this.#get_user_agent();
    } catch (error) {
      // console.error("URI Error:", error.message);
      this.log(`Не удалось декодировать query_id, пожалуйста, получите query id снова`, "warning");
    }
  }

  log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case "success":
        console.log(`[${timestamp}][Аккаунт ${this.accountIndex + 1}] [✓] ${msg}`.green);
        break;
      case "custom":
        console.log(`[${timestamp}][Аккаунт ${this.accountIndex + 1}] [*] ${msg}`.magenta);
        break;
      case "error":
        console.log(`[${timestamp}][Аккаунт ${this.accountIndex + 1}] [✗] ${msg}`.red);
        break;
      case "warning":
        console.log(`[${timestamp}][Аккаунт ${this.accountIndex + 1}] [!] ${msg}`.yellow);
        break;
      default:
        console.log(`[${timestamp}][Аккаунт ${this.accountIndex + 1}] [ℹ] ${msg}`.blue);
    }
  }

  async countdown(seconds) {
    for (let i = seconds; i > 0; i--) {
      const timestamp = new Date().toLocaleTimeString();
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`[*] Ожидание ${i} секунд для продолжения...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  }

  loadProxies() {
    try {
      const proxyFile = path.join(__dirname, "proxy.txt");
      if (fs.existsSync(proxyFile)) {
        this.proxies = fs.readFileSync(proxyFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
      } else {
        this.proxies = [];
        this.log("Файл proxy.txt не найден!", "warning");
      }
    } catch (error) {
      this.proxies = [];
      this.log(`Ошибка чтения файла proxy: ${error.message}`, "error");
    }
  }

  async makeRequest(config, proxyUrl) {
    let retries = 0;
    let response = null;
    try {
      if (proxyUrl) {
        const proxyAgent = new HttpsProxyAgent(proxyUrl);
        config.httpsAgent = proxyAgent;
        config.proxy = false;
      }
      response = await axios(config);
      if (response.status !== 200 && retries == 0) {
        this.log(`Ошибка API-запроса... повтор попытки...`);
        await sleep(3);
        retries++;
        response = await axios(config);
      }
      return response;
    } catch (error) {
      if (error.message?.includes("connect ECONNREFUSED")) {
        this.log(`Подключение не удалось! Проверьте прокси: ${error.message}`);
        process.exit(1);
      }
      if (error.status == 401 && retries == 0) {
        this.log(`Ошибка авторизации... получение нового токена...`);
        const loginResult = await this.login(this.queryId, "DTJy3oTR", proxyUrl);
        if (!loginResult.success) {
          this.log(`Авторизация не удалась, необходимо обновить query_id`, "error");
          process.exit(1);
        }
        this.saveToken(this.session_name, loginResult.token);
        retries++;
        response = await axios(config);
        return response;
      }
      throw error;
    }
  }

  async checkProxyIP(proxy) {
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);
      const response = await axios.get("https://api.ipify.org?format=json", {
        httpsAgent: proxyAgent,
        proxy: false,
        timeout: 10000,
      });

      if (response.status === 200) {
        return response.data.ip;
      } else {
        throw new Error(`Не удалось проверить IP прокси. Код статуса: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Ошибка при проверке IP прокси: ${error.message}`);
    }
  }

  async getGameInfo(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user_game_level/getGameInfo?invitationCode=`;

    const headers = { ...this.headers, Authorization: `Bearer ${token}` };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          data: {
            blumInvitationCode: "",
          },
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          coin: response.data.data.gameInfo.coin,
          energySurplus: response.data.data.gameInfo.energySurplus,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  generateHashCode(collectAmount, collectSeqNo) {
    const data = `${collectAmount}${collectSeqNo}${this.SECRET_KEY}`;
    return md5(data);
  }

  distributeEnergy(totalEnergy) {
    const parts = 10;
    let remaining = parseInt(totalEnergy);
    const distributions = [];

    for (let i = 0; i < parts; i++) {
      const isLast = i === parts - 1;
      if (isLast) {
        distributions.push(remaining);
      } else {
        const maxAmount = Math.min(300, Math.floor(remaining / 2));
        const amount = Math.floor(Math.random() * maxAmount) + 1;
        distributions.push(amount);
        remaining -= amount;
      }
    }

    return distributions;
  }

  async collectCoins(token, collectSeqNo, collectAmount, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user_game/collectCoin`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const hashCode = this.generateHashCode(collectAmount, collectSeqNo);
    const formData = new FormData();
    formData.append("hashCode", hashCode);
    formData.append("collectSeqNo", collectSeqNo.toString());
    formData.append("collectAmount", collectAmount.toString());

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          newCollectSeqNo: response.data.data.collectSeqNo,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getTaskLists(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/task/lists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
          params: {
            _t: Date.now(),
          },
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          tasks: response.data.data.lists.filter((task) => task.isFinish === 0),
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getBoxFree(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/prop_shop/Lists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
          params: {
            showPages: "spin",
            page: 1,
            pageSize: 10,
          },
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        const data = response.data.data.find((box) => box.propId == "500010001" && !box.toDayUse);
        if (data) {
          const res = await this.createBoxFree(
            token,
            {
              num: data.sellLists[0].id,
              propShopSellId: data.sellLists[0]?.limitSingleBuyNumMin || 1,
            },
            proxyUrl
          );
          if (res.data?.code == 0) {
            this.log("Получение бесплатного бокса успешно!", "success");
          }
        }
        return {
          success: true,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createBoxFree(token, params, proxyUrl) {
    const { num, propShopSellId } = params;
    const url = `${this.baseUrl}/miniapps/api/prop_shop/CreateGptPayOrder`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("num", num);
    formData.append("propShopSellId", propShopSellId);
    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          data: "ok",
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async finishTask(token, taskId, taskInfo, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/task/finish_task`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    let episodeCodes = require("./codes.json");
    const getEpisodeNumber = (name) => {
      const match = name.match(/Episode (\d+)/);
      return match ? parseInt(match[1]) : null;
    };

    const params = new URLSearchParams();
    params.append("id", taskId.toString());
    if (taskInfo && taskInfo.classifyName === "YouTube" && taskInfo.name.includes("Find hidden code")) {
      const episodeNum = getEpisodeNumber(taskInfo.name);
      if (episodeNum !== null && episodeCodes[episodeNum]) {
        params.append("pwd", episodeCodes[episodeNum]);
        this.log(`Отправка кода для эпизода ${episodeNum}: ${episodeCodes[episodeNum]}`, "info");
      }
    }

    params.append("_t", Date.now().toString());
    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: params,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getMineList(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine/getMineLists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          mines: response.data.data.lists,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async upgradeMine(token, mineId, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine/upgrade`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("mineId", mineId.toString());

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async upgradeTap(token, type, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user_game_level/upgradeLeve`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("type", type);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async spin(token, count = 1, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/game_slot/start`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("count", count);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );
      if (response.status === 200 && response.data.code === 0 && response.data.msg === "OK") {
        this.log(`Успешное вращение! Награда: ${response.data.data.rewardLists.rewardList[0].name}`, "success");
        return { success: true };
      } else {
        this.log(`Вращение не удалось: ${response.data.msg}`, "warning");
        return { success: false, error: response.data.msg };
      }
      } catch (error) {
        this.log(`Ошибка вращения: ${error.message}`, "error");
        return { success: false, error: error.message };
      }      
  }

  async handleSpin(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/game_slot/stamina`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0 && response.data.msg === "OK") {
        let spinTime = parseInt(response.data.data.staminaNow);
        this.log(`Текущее количество вращений: ${spinTime}/${response.data.data.staminaMax}`, "success");
        if (spinTime > 0) this.log("Начинаем вращение...");
        while (spinTime > 0) {
          await sleep(5);
          if (spinTime >= 50) {
            await this.spin(token, 50);
            spinTime -= 50;
          } else if (spinTime < 50 && spinTime >= 10) {
            await this.spin(token, 10);
            spinTime -= 10;
          } else if (spinTime < 10 && spinTime >= 3) {
            await this.spin(token, 3);
            spinTime -= 3;
          } else {
            await this.spin(token, 1);
            spinTime -= 1;
          }
        }
        return { success: true };
      } else {
        this.log(`Не удалось получить информацию о вращении: ${response.data.msg || "Неизвестная ошибка"}`, "warning");
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      this.log(`Ошибка получения информации о вращении: ${error.message || "Неизвестная ошибка"}`, "error");
      return { success: false, error: error.message };
    }
  }

  async getDailyComboReward(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine_active/getMineAcctiveInfo`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async dailyCombo(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine_active/JoinMineAcctive`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };
  
    const formData = new FormData();
    formData.append("cardIdStr", `${settings.CARD_COMBO[0]},${settings.CARD_COMBO[1]},${settings.CARD_COMBO[2]}`);
  
    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );
      if (response.status === 200 && response.data?.data?.status === 0) {
        this.log("Получен ежедневный комбо-бонус: 2,000,000", "success");
        return { success: true };
      } else if (response.status === 200 && response.data?.data?.status === -1) {
        this.log("Ежедневный комбо-бонус некорректен!", "warning");
        return { success: false };
      } else {
        this.log("Ошибка получения ежедневного комбо-бонуса: " + response.data.msg, "warning");
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      this.log("Ошибка получения ежедневного комбо-бонуса: " + error.message, "error");
      return { success: false, error: error.message };
    }
  }
  
  async processTasks(token, proxyUrl) {
    this.log("Получение списка задач...", "info");
    const taskList = await this.getTaskLists(token, proxyUrl);
  
    if (!taskList.success) {
      this.log(`Не удалось получить список задач: ${taskList.error}`, "warning");
      return;
    }
  
    if (taskList.tasks.length === 0) {
      this.log("Нет новых задач!", "warning");
      return;
    }
    const tasks = taskList.tasks.filter((task) => !settings.SKIP_TASKS.includes(task.id));
    for (const task of tasks) {
      this.log(`Выполнение задачи: ${task.name}`, "info");
      const result = await this.finishTask(token, task.id, task, proxyUrl);
  
      if (result.success) {
        this.log(`Задача ${task.name} выполнена успешно | Награда: ${task.rewardParty}`, "success");
      } else {
        this.log(`Не удалось выполнить задачу ${task.id} | ${task.name}: недостаточно условий или требуется ручное выполнение`, "warning");
      }
  
      await sleep(5);
    }
  }
  
  async processEnergyCollection(token, energy, initialCollectSeqNo, proxyUrl) {
    const energyDistributions = this.distributeEnergy(energy);
    let currentCollectSeqNo = initialCollectSeqNo;
    let totalCollected = 0;
  
    for (let i = 0; i < energyDistributions.length; i++) {
      const amount = energyDistributions[i];
      this.log(`Сбор энергии: попытка ${i + 1}/10: ${amount}`, "custom");
  
      const result = await this.collectCoins(token, currentCollectSeqNo, amount, proxyUrl);
  
      if (result.success) {
        totalCollected += amount;
        currentCollectSeqNo = result.newCollectSeqNo;
        this.log(`Успешно! Собрано: ${totalCollected}/${energy}`, "success");
      } else {
        this.log(`Ошибка при сборе энергии: ${result.error}`, "error");
        break;
      }
  
      if (i < energyDistributions.length - 1) {
        await sleep(5);
      }
    }
  
    return totalCollected;
  }
  
  async processMineUpgrades(token, currentCoin, proxyUrl) {
    this.log("Получение списка шахт...", "info");
    const mineList = await this.getMineList(token, proxyUrl);
  
    if (!mineList.success) {
      this.log(`Не удалось получить список шахт: ${mineList.error}`, "error");
      return;
    }
  
    let availableMines = mineList.mines
      .filter((mine) => mine.status === 1 && parseInt(mine.nextLevelCost) <= Math.min(currentCoin, settings.MAX_COST_UPGRADE) && mine.level < mine.limitMineLevel)
      .sort((a, b) => parseInt(b.nextPerHourReward) - parseInt(a.nextPerHourReward));
  
    if (availableMines.length === 0) {
      this.log("Нет шахт, которые можно улучшить!", "warning");
      return;
    }
  
    let remainingCoin = currentCoin;
    for (const mine of availableMines) {
      const cost = parseInt(mine.nextLevelCost);
      if (cost > remainingCoin) continue;
  
      this.log(`Улучшение шахты ID ${mine.mineId} | Стоимость: ${cost} | Доход/час: ${mine.nextPerHourReward}`, "info");
      const result = await this.upgradeMine(token, mine.mineId, proxyUrl);
  
      if (result.success) {
        remainingCoin -= cost;
        this.log(`Шахта ID ${mine.mineId} успешно улучшена | Осталось монет: ${remainingCoin}`, "success");
      } else {
        this.log(`Не удалось улучшить шахту ID ${mine.mineId}: ${result.error}`, "error");
        if (result.error?.includes("Недостаточно средств")) {
          const gameInfo = await this.getGameInfo(token, proxyUrl);
          if (gameInfo.success) remainingCoin = gameInfo.coin;
        }
      }
  
      await sleep(5);
    }
    await sleep(3);
    await this.processMineUpgrades(token, remainingCoin, proxyUrl);
  }  

  async processTapUpgrades(token, data, proxyUrl) {
    const tapInfo = data.tapInfo;
    let currentCoin = data.gameInfo.coin;
    const types = ["bonusChance", "tap", "recovery", "energy", "collectInfo", "bonusRatio"];
  
    const listType = types.filter((type) => {
      if (+tapInfo[type]?.nextCostCoin <= Math.min(currentCoin, settings.MAX_COST_UPGRADE) && +tapInfo[type]?.level <= +settings.MAX_LEVEL_TAP_UPGRADE) return type;
    });
    if (listType.length == 0) {
      return;
    }
    for (const type of listType) {
      if (+tapInfo[type]?.nextCostCoin > currentCoin) continue;
  
      this.log(`Улучшение ${type} | Стоимость: ${tapInfo[type]?.nextCostCoin} | Следующий уровень: ${tapInfo[type]?.level + 1}`, "info");
      const result = await this.upgradeTap(token, type, proxyUrl);
      if (result.success) {
        currentCoin -= +tapInfo[type]?.nextCostCoin;
        this.log(`Улучшение ${type} успешно до уровня ${tapInfo[type]?.level + 1}`, "success");
      } else {
        this.log(`Не удалось улучшить ${type}: ${result.error}`, "error");
      }
      await sleep(3);
    }
  
    await sleep(3);
    const gameInfo = await this.getGameInfo(token, proxyUrl);
    if (gameInfo.success) {
      await this.processTapUpgrades(token, gameInfo.data, proxyUrl);
    }
  }  

  async getSignLists(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/sign/getSignLists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          lists: response.data.data.lists,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sign(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/sign/sign`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async processSignIn(token, proxyUrl) {
    this.log("Проверка статуса ежедневной отметки...", "info");
    const signList = await this.getSignLists(token, proxyUrl);
  
    if (!signList.success) {
      this.log(`Не удалось получить информацию о ежедневной отметке: ${signList.error}`, "error");
      return;
    }
  
    const availableDay = signList.lists.find((day) => day.status === 0);
    if (!availableDay) {
      this.log("Нет дней, требующих отметки!", "warning");
      return;
    }
  
    this.log(`Отмечаем день ${availableDay.days}...`, "info");
    const result = await this.sign(token, proxyUrl);
  
    if (result.success) {
      this.log(`День ${availableDay.days} успешно отмечен | Награда: ${availableDay.normal}`, "success");
    } else {
      this.log(`Не удалось отметить день: ${result.error}`, "error");
    }
  
    await sleep(5);
  }  

  async getGangLists(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/gang/gang_lists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("boostNum", "15");
    formData.append("powerNum", "35");

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          myGang: response.data.data.myGang,
          gangLists: response.data.data.lists,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async joinGang(token, gangName = "dev_crypto_gr", proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/gang/gang_join`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("name", gangName);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async lGang(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/gang/gang_leave`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
    };
    try {
      const response = await axios.get(url, formData, { headers }, proxyUrl);
      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async processGangJoin(token, proxyUrl) {
    this.log("Проверка информации о банде...", "info");
    const gangList = await this.getGangLists(token, proxyUrl);
  
    if (!gangList.success) {
      this.log(`Не удалось получить информацию о банде: ${gangList.error}`, "warning");
      return;
    }
  
    if (!gangList.myGang.gangId) {
      const result = await this.joinGang(token, "dev_crypto_gr", proxyUrl);
      if (result.success) {
        this.log("Вы успешно присоединились к банде!", "success");
      } else {
        this.log(`Не удалось присоединиться к банде: ${result.error}`, "error");
      }
    } else if (gangList.myGang.gangId !== "1879555305670012928") {
      const res = await this.lGang(token, proxyUrl);
      if (res.success) {
        await this.joinGang(token, "dev_crypto_gr", proxyUrl);
      }
    }
  
    await sleep(5);
  }  

  async login(initData, invitationCode, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user/telegram_auth`;
    const formData = new FormData();
    formData.append("invitationCode", invitationCode);
    formData.append("initData", initData);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers: this.headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          token: response.data.data.token,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  saveToken(userId, token) {
    let tokens = {};
    if (fs.existsSync(this.tokenPath)) {
      tokens = JSON.parse(fs.readFileSync(this.tokenPath, "utf8"));
    }
    tokens[userId] = token;
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
  }

  getToken(userId) {
    if (fs.existsSync(this.tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(this.tokenPath, "utf8"));
      return tokens[userId] || null;
    }
    return null;
  }

  isExpired(token) {
    const [header, payload, sign] = token.split(".");
    const decodedPayload = Buffer.from(payload, "base64").toString();
  
    try {
      const parsedPayload = JSON.parse(decodedPayload);
      const now = Math.floor(DateTime.now().toSeconds());
  
      if (parsedPayload.exp) {
        const expirationDate = DateTime.fromSeconds(parsedPayload.exp).toLocal();
        this.log(`Токен истекает: ${expirationDate.toFormat("yyyy-MM-dd HH:mm:ss")}`, "custom");
  
        const isExpired = now > parsedPayload.exp;
        this.log(`Токен истек? ${isExpired ? "Да, вам нужно обновить токен" : "Нет, всё работает"}`, "custom");
  
        return isExpired;
      } else {
        this.log(`Вечный токен: невозможно определить время истечения`, "warning");
        return false;
      }
    } catch (error) {
      this.log(`Ошибка: ${error.message}`, "error");
      return true;
    }
  }  

  async runAccount() {
    const initData = this.queryId;
    const currentProxy = this.proxy || null;
    let proxyIP = "Без прокси";
  
    try {
      if (currentProxy) {
        try {
          proxyIP = await this.checkProxyIP(currentProxy);
        } catch (error) {
          this.log(`Ошибка проверки прокси: ${error.message}`, "warning");
          proxyIP = "Ошибка проверки IP";
        }
      }
  
      const i = this.accountIndex;
      const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
      const userId = userData.id;
      const firstName = userData.first_name || "";
      const lastName = userData.last_name || "";
      this.session_name = userId;
      const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
      console.log(`========== Аккаунт ${i + 1} | ${firstName + " " + lastName} | IP: ${proxyIP} | Начало через ${timesleep} секунд...==========`.magenta);
      this.set_headers();
      await sleep(timesleep);
  
      this.log(`Вход в систему...`, "info");
      const loginResult = await this.login(initData, "DTJy3oTR", currentProxy);
  
      if (!loginResult.success) {
        this.log(`Вход не выполнен, необходимо обновить query_id: ${loginResult.error}`, "error");
        return;
      }
  
      let token = loginResult.token;
      this.log("Вход выполнен успешно!", "success");
      await sleep(5);
      await this.processSignIn(token, currentProxy);
      await sleep(5);
      await this.getBoxFree(token, currentProxy);
  
      if (settings.DAILY_COMBO) {
        await sleep(5);
        const res = await this.getDailyComboReward(token, currentProxy);
        if (res?.data?.resultNum == 0) this.log(`Вы уже получили ежедневный комбо-бонус!`, "warning");
        else await this.dailyCombo(token, currentProxy);
      }
  
      if (settings.AUTO_SPIN) {
        await sleep(3);
        await this.handleSpin(token, currentProxy);
      }
  
      if (settings.AUTO_JOIN_GANG) {
        await sleep(5);
        await this.processGangJoin(token, currentProxy);
      }
  
      if (settings.AUTO_TASK) {
        await sleep(5);
        await this.processTasks(token, currentProxy);
      }
  
      await sleep(5);
      const gameInfo = await this.getGameInfo(token, currentProxy);
      if (gameInfo.success) {
        this.log(`Монеты: ${gameInfo.coin}`, "custom");
        this.log(`Энергия: ${gameInfo.energySurplus}`, "custom");
        if (settings.AUTO_TAP) {
          if (parseInt(gameInfo.energySurplus) > 0) {
            this.log(`Начало сбора энергии...`, "info");
            const collectSeqNo = gameInfo.data.tapInfo.collectInfo.collectSeqNo;
            await this.processEnergyCollection(token, gameInfo.energySurplus, collectSeqNo, currentProxy);
          } else {
            this.log(`Недостаточно энергии для сбора`, "warning");
          }
        }
        if (settings.AUTO_UPGRADE_TAP) {
          await sleep(5);
          await this.processTapUpgrades(token, gameInfo.data, currentProxy);
        }
  
        if (settings.AUTO_UPGRADE) {
          await sleep(5);
          await this.processMineUpgrades(token, parseInt(gameInfo.coin), currentProxy);
        }
      } else {
        this.log(`Не удалось получить информацию об игре: ${gameInfo.error}`, "warning");
      }
    } catch (error) {
      this.log(`Ошибка обработки аккаунта: ${error.message}`, "error");
      return;
    }
  }
}  

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy } = workerData;
  const to = new Bums(queryId, accountIndex, proxy);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");

  if (queryIds.length > proxies.length) {
    console.log("Количество прокси и данных должно быть одинаковым.".red);
    console.log(`Данные: ${queryIds.length}`);
    console.log(`Прокси: ${proxies.length}`);
    process.exit(1);
  }
  console.log("Dev | Crypto_GR (https://t.me/dev_crypto_gr)".yellow);
  let maxThreads = settings.MAX_THEADS;

  queryIds.map((val, i) => new Bums(val, i, proxies[i]).createUserAgent());

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              resolve();
            });
            worker.on("error", (error) => {
              console.log(`Ошибка у worker для аккаунта ${currentIndex}: ${error.message}`);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              worker.terminate();
              if (code !== 0) {
                errors.push(`Worker для аккаунта ${currentIndex} завершился с кодом: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await sleep(3);
      }
    }
    const to = new Bums(null, 0, proxies[0]);
    await sleep(3);
    updateEnv("DAILY_COMBO", "false");
    await sleep(5);
    console.log("Инструмент скоро будет доступен в FarmBot (https://t.me/farm_cryptogr_bot) для упрощения работы со скриптом. Следите за обновлениями!".yellow);
    console.log(`=============Все аккаунты завершены=============`.magenta);
    await to.countdown(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Произошла ошибка:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
