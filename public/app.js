(() => {
  const tg = window.Telegram?.WebApp;
  const balanceEl = document.getElementById("balance");
  const statusEl = document.getElementById("status");
  const messageEl = document.getElementById("message");
  const mintButton = document.getElementById("mint");
  let balance = 0;
  let busy = false;

  function setStatus(text) { statusEl.textContent = text; }
  function render() { balanceEl.textContent = balance.toLocaleString("ru-RU"); }

  async function api(path, method = "GET") {
    const initData = tg?.initData || "";
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "request_failed");
    return data;
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
      messageEl.textContent = "Нажимай на монету, чтобы получить игровые очки.";
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
    } catch (error) {
      messageEl.textContent = error.message === "cooldown" ? "Слишком быстро. Попробуй ещё раз." : "Не удалось начислить монету.";
    } finally {
      busy = false;
      mintButton.disabled = false;
    }
  });

  load();
})();