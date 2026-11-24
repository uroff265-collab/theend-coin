(() => {
  const tg = window.Telegram?.WebApp;
  const balanceEl = document.getElementById("balance");
  const statusEl = document.getElementById("status");
  const messageEl = document.getElementById("message");
  const mintButton = document.getElementById("mint");
  const bonusButton = document.getElementById("bonus");
  const bonusStatus = document.getElementById("bonus-status");
  const taskClaimButton = document.getElementById("task-claim");
  const taskProgress = document.getElementById("task-progress");
  const taskProgressBar = document.getElementById("task-progress-bar");
  const leaderboardEl = document.getElementById("leaderboard");
  const myRankEl = document.getElementById("my-rank");
  let balance = 0;
  let busy = false;
  let overviewBusy = false;

  function setStatus(text) { statusEl.textContent = text; }
  function render() { balanceEl.textContent = balance.toLocaleString("ru-RU"); }

  async function api(path, method = "GET") {
    const initData = tg?.initData || "";
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "request_failed");
      error.data = data;
      throw error;
    }
    return data;
  }

  function renderOverview(data) {
    bonusButton.disabled = data.dailyBonus.claimed;
    bonusButton.textContent = data.dailyBonus.claimed ? "Бонус уже получен" : "Забрать бонус";
    bonusStatus.textContent = data.dailyBonus.claimed ? "Сегодня бонус уже забран" : "Доступен один раз в день";

    const progress = data.dailyTask.progress;
    taskProgress.textContent = data.dailyTask.claimed
      ? "Задание выполнено — награда получена"
      : progress + " / " + data.dailyTask.target + " нажатий";
    taskProgressBar.style.width = Math.min(100, progress / data.dailyTask.target * 100) + "%";
    taskClaimButton.disabled = data.dailyTask.claimed || progress < data.dailyTask.target;
    taskClaimButton.textContent = data.dailyTask.claimed ? "Награда получена" : "Забрать награду";

    myRankEl.textContent = data.myRank ? "Твоё место: #" + data.myRank : "Место: —";
    leaderboardEl.replaceChildren();
    if (!data.leaderboard.length) {
      const empty = document.createElement("li");
      empty.textContent = "Пока нет игроков";
      leaderboardEl.append(empty);
    } else {
      data.leaderboard.forEach((player) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const score = document.createElement("strong");
        name.textContent = "#" + player.rank + "  " + player.name;
        score.textContent = player.balance.toLocaleString("ru-RU") + " ₮";
        item.append(name, score);
        leaderboardEl.append(item);
      });
    }
  }

  async function refreshOverview() {
    if (overviewBusy) return;
    overviewBusy = true;
    try {
      renderOverview(await api("/api/game/overview"));
    } catch {
      bonusStatus.textContent = "Не удалось загрузить данные";
      taskProgress.textContent = "Нет соединения с сервером";
      leaderboardEl.textContent = "Рейтинг временно недоступен";
    } finally {
      overviewBusy = false;
    }
  }

  async function load() {
    if (!tg || !tg.initData) {
      setStatus("Открой через Telegram");
      messageEl.textContent = "Для входа открой Mini App из меню бота в Telegram.";
      return;
    }
    tg.ready();
    tg.expand();
    try {
      const data = await api("/api/coin/me");
      balance = data.balance;
      render();
      mintButton.disabled = false;
      setStatus("В игре");
      messageEl.textContent = "Нажимай на монету, выполняй задания и забирай бонусы.";
      await refreshOverview();
    } catch (error) {
      setStatus("Нет соединения");
      messageEl.textContent = error.message === "invalid_telegram_auth"
        ? "Не удалось проверить Telegram. Открой Mini App через бота."
        : "Сервер или база данных пока не настроены.";
    }
  }

  mintButton.addEventListener("click", async () => {
    if (busy || mintButton.disabled) return;
    busy = true;
    mintButton.disabled = true;
    try {
      const data = await api("/api/coin/mint", "POST");
      balance = data.balance;
      render();
      messageEl.textContent = "+1 THEEND COIN";
      tg?.HapticFeedback?.impactOccurred("light");
      await refreshOverview();
    } catch (error) {
      messageEl.textContent = error.message === "cooldown" ? "Слишком быстро. Попробуй ещё раз." : "Не удалось начислить монету.";
    } finally {
      busy = false;
      mintButton.disabled = false;
    }
  });

  bonusButton.addEventListener("click", async () => {
    bonusButton.disabled = true;
    try {
      const data = await api("/api/game/daily-bonus", "POST");
      balance = data.balance;
      render();
      bonusStatus.textContent = "Получено +50 ₮. Возвращайся завтра!";
      messageEl.textContent = "Ежедневный бонус +50 THEEND COIN";
      await refreshOverview();
    } catch (error) {
      bonusStatus.textContent = error.message === "already_claimed" ? "Сегодня бонус уже забран" : "Не удалось получить бонус";
      await refreshOverview();
    }
  });

  taskClaimButton.addEventListener("click", async () => {
    taskClaimButton.disabled = true;
    try {
      const data = await api("/api/game/claim-task", "POST");
      balance = data.balance;
      render();
      messageEl.textContent = "Задание выполнено: +25 THEEND COIN";
      await refreshOverview();
    } catch (error) {
      taskProgress.textContent = error.message === "task_not_complete"
        ? (error.data?.progress || 0) + " / 50 нажатий"
        : error.message === "already_claimed" ? "Награда уже получена сегодня" : "Не удалось получить награду";
      await refreshOverview();
    }
  });

  load();
})();