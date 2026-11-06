const STORAGE_KEY = "walskya-side-activities-v1";
const INCOME_INTERVAL = 180;
const LOCATIONS = [
  { x: -176, z: -300 },
  { x: -300, z: -157 },
  { x: -229, z: -229 },
  { x: -176, z: 60 },
  { x: 6, z: -300 },
  { x: -60, z: 316 }
];
const BUSINESSES = [
  { id: "garage", name: "Oficina do Centro", price: 4500, income: 450 },
  { id: "bar", name: "Bar da Orla", price: 7500, income: 750 },
  { id: "nightclub", name: "Casa noturna da Lapa", price: 10000, income: 900 }
];
const LOANS = [
  { principal: 1000, total: 1250 },
  { principal: 3000, total: 3900 },
  { principal: 5000, total: 7000 }
];
const LOAN_INSTALLMENT = 250;
const POLICE_FINE_PER_STAR = 500;
const SERVICE_LOCATIONS = [
  { id: "bank", x: -98, z: -35, color: "#38e7ff" },
  { id: "police", x: 63, z: 49, color: "#68a0ff" },
  { id: "nightclub", x: -60, z: 322, color: "#f472b6" }
];
const PACKAGES = [
  { id: "cristo", name: "Estrada do Cristo", x: -360, z: -260 },
  { id: "morro", name: "Estrada do Morro", x: -300, z: -200 },
  { id: "parque", name: "Alameda do Parque", x: -260, z: 142 },
  { id: "centro", name: "Centro Histórico", x: 40, z: -60 },
  { id: "estadio", name: "Avenida Leste", x: 170, z: -80 },
  { id: "industria", name: "Distrito Industrial", x: 170, z: -300 },
  { id: "porto", name: "Acesso ao Porto", x: 170, z: 200 },
  { id: "orla", name: "Avenida Atlântica", x: -60, z: 322 }
];
const PACKAGE_REWARD = 500;
const PACKAGE_BONUS = 5000;
const PACKAGE_RADAR_RANGE = 45;
const PACKAGE_PICKUP_RANGE = 5;
const JOBS = {
  delivery: { title: "ENTREGAS", reward: 1200, time: 210, stops: 3, noun: "parada" },
  race: { title: "CORRIDA CONTRA O RELÓGIO", reward: 1800, time: 165, stops: 3, noun: "checkpoint" },
  getaway: { title: "FUGA DA POLÍCIA", reward: 700, time: 150 }
};

function readProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { businesses: [], packages: [], incomeElapsed: 0, completed: 0, loan: null };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") throw new TypeError("Formato de save inválido.");
    const loanOffer = LOANS.find((item) => item.principal === saved.loan?.principal);
    const loan = loanOffer &&
      Number.isInteger(saved.loan.balance) &&
      saved.loan.balance > 0 &&
      saved.loan.balance <= loanOffer.total
      ? { principal: loanOffer.principal, total: loanOffer.total, balance: saved.loan.balance }
      : null;
    return {
      businesses: Array.isArray(saved.businesses)
        ? saved.businesses.filter((id) => BUSINESSES.some((business) => business.id === id))
        : [],
      packages: Array.isArray(saved.packages)
        ? saved.packages.filter((id) => PACKAGES.some((item) => item.id === id))
        : [],
      incomeElapsed: Number.isFinite(saved.incomeElapsed)
        ? Math.max(0, Math.min(saved.incomeElapsed, INCOME_INTERVAL))
        : 0,
      completed: Number.isInteger(saved.completed) && saved.completed >= 0 ? saved.completed : 0,
      loan
    };
  } catch (error) {
    console.warn("Não foi possível carregar os trabalhos extras.", error);
    return { businesses: [], packages: [], incomeElapsed: 0, completed: 0 };
  }
}

function createInterface() {
  const root = document.createElement("section");
  root.id = "side-activities";
  root.hidden = true;
  root.innerHTML = `
    <div class="side-activities-panel" hidden>
      <h2>TRABALHOS DA CIDADE</h2>
      <p class="side-job-status" role="status" aria-live="polite"></p>
      <button type="button" data-start="delivery">Fazer entregas · R$ 1.200</button>
      <button type="button" data-start="race">Corrida contra o relógio · R$ 1.800</button>
      <button type="button" data-start="getaway">Fuga da polícia · a partir de R$ 700</button>
      <button type="button" data-cancel hidden>Cancelar trabalho</button>
      <h3>BANCO</h3>
      <p class="side-service-status" data-loan-status role="status"></p>
      <div class="side-loan-options">
        <button type="button" data-loan="1000">Empréstimo R$ 1.000 · devolve R$ 1.250</button>
        <button type="button" data-loan="3000">Empréstimo R$ 3.000 · devolve R$ 3.900</button>
        <button type="button" data-loan="5000">Empréstimo R$ 5.000 · devolve R$ 7.000</button>
      </div>
      <button type="button" data-repay> Pagar parcela de R$ 250</button>
      <button type="button" data-payoff>Quitar empréstimo</button>
      <h3>DELEGACIA</h3>
      <p class="side-service-status" data-police-status role="status"></p>
      <button type="button" data-clear-wanted>Pagar multa · R$ 500 por estrela</button>
      <h3>PACOTES SECRETOS</h3>
      <p class="side-collectible-progress" role="status"></p>
      <h3>NEGÓCIOS</h3>
      <div class="side-businesses"></div>
      <button type="button" data-close>Fechar</button>
    </div>
    <button type="button" class="side-activities-toggle" aria-expanded="false">
      TRABALHOS [J]
    </button>
  `;
  document.body.appendChild(root);
  return {
    root,
    panel: root.querySelector(".side-activities-panel"),
    toggle: root.querySelector(".side-activities-toggle"),
    status: root.querySelector(".side-job-status"),
    loanStatus: root.querySelector("[data-loan-status]"),
    loanOptions: root.querySelector(".side-loan-options"),
    repay: root.querySelector("[data-repay]"),
    payoff: root.querySelector("[data-payoff]"),
    policeStatus: root.querySelector("[data-police-status]"),
    clearWanted: root.querySelector("[data-clear-wanted]"),
    collectibles: root.querySelector(".side-collectible-progress"),
    businesses: root.querySelector(".side-businesses"),
    cancel: root.querySelector("[data-cancel]")
  };
}

function attach(game) {
  const ui = createInterface();
  const progress = readProgress();
  let activeJob = null;
  let lastFrame = performance.now();
  let lastPaint = 0;
  let businessSignature = "";
  let alertedPackageId = "";

  const position = () => {
    if (game.session.onFoot) {
      const player = game.world.player?.group?.position;
      return player ? { x: player.x, z: player.z } : null;
    }
    const active = game.world.active?.group?.position ?? game.world.player?.group?.position;
    return active ? { x: active.x, z: active.z } : null;
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (error) {
      console.warn("Não foi possível salvar os trabalhos extras.", error);
    }
  };

  const ownedIncome = () => BUSINESSES
    .filter((business) => progress.businesses.includes(business.id))
    .reduce((sum, business) => sum + business.income, 0);

  const setStatus = (text) => {
    if (ui.status.textContent !== text) ui.status.textContent = text;
  };

  const paintCollectibles = () => {
    const count = progress.packages.length;
    ui.collectibles.textContent = count === PACKAGES.length
      ? `Todos encontrados! Bônus de coleção: R$ ${PACKAGE_BONUS.toLocaleString("pt-BR")}.`
      : `${count}/${PACKAGES.length} encontrados · R$ ${PACKAGE_REWARD} cada + bônus final de R$ ${PACKAGE_BONUS.toLocaleString("pt-BR")}.`;
  };

  const paintBusinesses = () => {
    const signature = `${game.session.money}|${progress.businesses.join(",")}`;
    if (signature === businessSignature) return;
    businessSignature = signature;
    ui.businesses.replaceChildren(...BUSINESSES.map((business) => {
      const item = document.createElement("div");
      item.className = "side-business";
      const description = document.createElement("p");
      description.textContent = `R$ ${business.income} a cada 3 min jogados`;
      const name = document.createElement("strong");
      name.textContent = business.name;
      const button = document.createElement("button");
      const owned = progress.businesses.includes(business.id);
      button.type = "button";
      button.dataset.business = business.id;
      button.disabled = owned || game.session.money < business.price;
      button.textContent = owned ? "COMPRADO" : `R$ ${business.price}`;
      item.append(name, description, button);
      return item;
    }));
  };

  const paintServices = () => {
    const loan = progress.loan;
    const loanText = loan
      ? `Dívida: R$ ${loan.balance.toLocaleString("pt-BR")} de R$ ${loan.total.toLocaleString("pt-BR")}. Um empréstimo ativo por vez, sem juros adicionais.`
      : "Escolha um valor. Os juros são fixos e você paga quando quiser.";
    if (ui.loanStatus.textContent !== loanText) ui.loanStatus.textContent = loanText;
    ui.loanOptions.hidden = !!loan;
    ui.repay.hidden = !loan;
    ui.payoff.hidden = !loan;
    if (loan) {
      const installment = Math.min(LOAN_INSTALLMENT, loan.balance);
      ui.repay.textContent = `Pagar parcela · R$ ${installment.toLocaleString("pt-BR")}`;
      ui.repay.disabled = game.session.money < installment;
      ui.payoff.textContent = `Quitar tudo · R$ ${loan.balance.toLocaleString("pt-BR")}`;
      ui.payoff.disabled = game.session.money < loan.balance;
    }

    const wanted = game.world.police.level;
    const policeText = wanted > 0
      ? `Procurado: ${wanted} estrela${wanted === 1 ? "" : "s"}. Pague a multa para remover uma estrela.`
      : "Sem nível de procurado. A delegacia não tem multas para cobrar.";
    if (ui.policeStatus.textContent !== policeText) ui.policeStatus.textContent = policeText;
    ui.clearWanted.disabled = wanted < 1 || game.session.money < POLICE_FINE_PER_STAR;
  };

  const borrow = (principal) => {
    const offer = LOANS.find((item) => item.principal === principal);
    if (!offer || progress.loan) return;
    progress.loan = { principal: offer.principal, total: offer.total, balance: offer.total };
    game.economy.addMoney(offer.principal, "bank-loan");
    save();
    game.hud.banner("EMPRÉSTIMO APROVADO", `R$ ${offer.principal.toLocaleString("pt-BR")} · total a pagar R$ ${offer.total.toLocaleString("pt-BR")}`);
    paintServices();
  };

  const repayLoan = (requested) => {
    if (!progress.loan) return;
    const payment = Math.min(requested, progress.loan.balance, game.session.money);
    if (payment <= 0) {
      ui.loanStatus.textContent = "Você não tem dinheiro suficiente para pagar uma parcela.";
      return;
    }
    game.economy.addMoney(-payment, "bank-loan-payment");
    progress.loan.balance -= payment;
    if (progress.loan.balance === 0) {
      progress.loan = null;
      game.hud.banner("DÍVIDA QUITADA", "Seu crédito está livre para um novo empréstimo.");
    } else {
      game.hud.message(`Parcela paga · restam R$ ${progress.loan.balance.toLocaleString("pt-BR")}.`, { ms: 2500 });
    }
    save();
    paintServices();
  };

  const payPoliceFine = () => {
    if (game.world.police.level < 1 || game.session.money < POLICE_FINE_PER_STAR) return;
    game.economy.addMoney(-POLICE_FINE_PER_STAR, "police-station");
    game.wanted.dropStar();
    game.hud.banner("MULTA PAGA", "A polícia perdeu uma estrela de procurado.");
    paintServices();
  };

  const refresh = () => {
    const hasJob = !!activeJob;
    ui.cancel.hidden = !hasJob;
    ui.root.hidden = game.state !== "playing";
    if (ui.root.hidden) {
      ui.panel.hidden = true;
      ui.toggle.setAttribute("aria-expanded", "false");
    }
    for (const button of ui.panel.querySelectorAll("[data-start]")) {
      button.hidden = hasJob;
      button.disabled = button.dataset.start === "getaway" && game.world.police.level < 1;
    }
    paintBusinesses();
    paintServices();
  };

  const setTarget = () => {
    originalSetBlips(withTarget(game.minimap.blips));
  };

  const withTarget = (blips) => [
    ...(blips ?? []).filter((blip) => !blip.sideActivity),
    ...(activeJob?.target
      ? [{ ...activeJob.target, kind: "call", color: "#38e7ff", r: 5, sideActivity: true }]
      : []),
    ...nearbyPackages(position()).map((item) => ({
      x: item.x,
      z: item.z,
      kind: "call",
      color: "#f1c40f",
      r: 4,
      sideActivity: true
    })),
    ...SERVICE_LOCATIONS.map((location) => ({
      x: location.x,
      z: location.z,
      kind: "call",
      color: location.color,
      r: 3,
      sideActivity: true
    }))
  ];

  const nearbyPackages = (current) => current
    ? PACKAGES.filter((item) => !progress.packages.includes(item.id) &&
      Math.hypot(current.x - item.x, current.z - item.z) <= PACKAGE_RADAR_RANGE)
    : [];

  const collectPackage = (item) => {
    progress.packages.push(item.id);
    game.economy.addMoney(PACKAGE_REWARD, "hidden-package");
    save();
    paintCollectibles();
    originalSetBlips(withTarget(game.minimap.blips));
    game.hud.banner("PACOTE SECRETO", `${item.name} · R$ ${PACKAGE_REWARD}`);
    if (progress.packages.length === PACKAGES.length) {
      game.economy.addMoney(PACKAGE_BONUS, "package-collection");
      game.hud.banner("COLEÇÃO COMPLETA", `Bônus de R$ ${PACKAGE_BONUS.toLocaleString("pt-BR")} recebido!`);
    }
  };

  const finishJob = (success, reason = "") => {
    if (!activeJob) return;
    const job = activeJob;
    activeJob = null;
    setTarget();
    if (success) {
      const bonus = job.type === "getaway" ? Math.max(0, job.peakWanted - 1) * 250 : 0;
      const reward = JOBS[job.type].reward + bonus;
      game.economy.addMoney(reward, "side-activity");
      progress.completed += 1;
      save();
      game.hud.banner("TRABALHO CONCLUÍDO", `R$ ${reward.toLocaleString("pt-BR")} recebidos`);
      setStatus(`Trabalhos concluídos: ${progress.completed}.`);
    } else {
      game.hud.message(reason || "Trabalho cancelado.", { ms: 2500 });
      setStatus(reason || "Trabalho cancelado.");
    }
    refresh();
  };

  const startJob = (type) => {
    if (activeJob || !JOBS[type]) return;
    const spec = JOBS[type];
    if (type === "getaway") {
      if (game.world.police.level < 1) {
        setStatus("A polícia precisa estar atrás de você para iniciar a fuga.");
        return;
      }
      activeJob = {
        type,
        remaining: spec.time,
        sawWanted: true,
        peakWanted: game.world.police.level
      };
    } else {
      const current = position();
      if (!current) {
        setStatus("Entre no jogo antes de aceitar um trabalho.");
        return;
      }
      const route = [...LOCATIONS]
        .sort((a, b) => Math.hypot(b.x - current.x, b.z - current.z) -
          Math.hypot(a.x - current.x, a.z - current.z))
        .slice(0, spec.stops);
      activeJob = { type, remaining: spec.time, route, index: 0, target: route[0] };
    }
    setTarget();
    refresh();
    setStatus(type === "getaway"
      ? "Despiste a polícia antes que o tempo acabe."
      : `Siga o marcador no minimapa: ${spec.noun} 1/${spec.stops}.`);
    ui.panel.hidden = true;
    ui.toggle.setAttribute("aria-expanded", "false");
  };

  ui.root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button === ui.toggle) {
      ui.panel.hidden = !ui.panel.hidden;
      ui.toggle.setAttribute("aria-expanded", String(!ui.panel.hidden));
      refresh();
      return;
    }
    if (button.hasAttribute("data-close")) {
      ui.panel.hidden = true;
      ui.toggle.setAttribute("aria-expanded", "false");
      return;
    }
    if (button.hasAttribute("data-cancel")) {
      finishJob(false, "Você cancelou o trabalho.");
      return;
    }
    if (button.dataset.start) {
      startJob(button.dataset.start);
      return;
    }
    if (button.dataset.loan) {
      borrow(Number(button.dataset.loan));
      refresh();
      return;
    }
    if (button === ui.repay) {
      repayLoan(LOAN_INSTALLMENT);
      refresh();
      return;
    }
    if (button === ui.payoff) {
      repayLoan(progress.loan?.balance ?? 0);
      refresh();
      return;
    }
    if (button === ui.clearWanted) {
      payPoliceFine();
      refresh();
      return;
    }
    const business = BUSINESSES.find((item) => item.id === button.dataset.business);
    if (!business || progress.businesses.includes(business.id)) return;
    if (game.session.money < business.price) {
      setStatus(`Você precisa de R$ ${business.price.toLocaleString("pt-BR")} para comprar.`);
      return;
    }
    game.economy.addMoney(-business.price, "side-business");
    progress.businesses.push(business.id);
    save();
    game.hud.banner("NEGÓCIO COMPRADO", `${business.name} gera R$ ${business.income} a cada 3 min`);
    setStatus(`${business.name} agora gera renda enquanto você joga.`);
    refresh();
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyJ" || event.repeat || event.isComposing) return;
    if (event.target instanceof HTMLElement &&
      (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
    if (game.state !== "playing") return;
    event.preventDefault();
    ui.toggle.click();
  });

  const originalSetBlips = game.minimap.setBlips.bind(game.minimap);
  game.minimap.setBlips = (blips) => originalSetBlips(withTarget(blips));

  paintBusinesses();
  paintCollectibles();

  const update = (now) => {
    const delta = Math.min((now - lastFrame) / 1000, 1);
    lastFrame = now;
    if (game.state === "playing") {
      const income = ownedIncome();
      if (income > 0) {
        progress.incomeElapsed += delta;
        if (progress.incomeElapsed >= INCOME_INTERVAL) {
          progress.incomeElapsed -= INCOME_INTERVAL;
          game.economy.addMoney(income, "side-business");
          game.hud.message(`Negócios renderam R$ ${income.toLocaleString("pt-BR")}.`, { ms: 3000 });
          save();
          refresh();
        }
      }
      if (activeJob) {
        const spec = JOBS[activeJob.type];
        activeJob.remaining -= delta;
        if (activeJob.type === "getaway") {
          const wanted = game.world.police.level;
          activeJob.peakWanted = Math.max(activeJob.peakWanted, wanted);
          if (wanted > 0) activeJob.sawWanted = true;
          if (activeJob.sawWanted && wanted === 0) finishJob(true);
        } else if (game.session.onFoot) {
          setStatus("Entre em um veículo para concluir o trabalho.");
        } else {
          const current = position();
          const target = activeJob.target;
          if (current && target && Math.hypot(current.x - target.x, current.z - target.z) <= 14) {
            activeJob.index += 1;
            if (activeJob.index >= activeJob.route.length) finishJob(true);
            else {
              activeJob.target = activeJob.route[activeJob.index];
              setTarget();
              setStatus(`${spec.noun} ${activeJob.index + 1}/${activeJob.route.length}. Siga o marcador!`);
              game.hud.message(`${spec.title}: ${spec.noun} ${activeJob.index + 1}/${activeJob.route.length}`, { ms: 2000 });
            }
          }
        }
        if (activeJob && activeJob.remaining <= 0) finishJob(false, "O tempo acabou. O trabalho falhou.");
      }
      const current = position();
      const nearby = nearbyPackages(current);
      const closestPackage = nearby.reduce((closest, item) => {
        const distance = Math.hypot(current.x - item.x, current.z - item.z);
        return !closest || distance < closest.distance ? { item, distance } : closest;
      }, null);
      if (closestPackage?.distance <= PACKAGE_PICKUP_RANGE) {
        collectPackage(closestPackage.item);
        alertedPackageId = "";
      } else {
        const nextPackage = closestPackage?.distance <= PACKAGE_RADAR_RANGE
          ? closestPackage.item
          : null;
        if (nextPackage && nextPackage.id !== alertedPackageId) {
          game.hud.message("Pacote secreto por perto! Procure o marcador amarelo no minimapa.", { ms: 3000 });
          alertedPackageId = nextPackage.id;
        } else if (!nextPackage) {
          alertedPackageId = "";
        }
      }
      if (now - lastPaint > 500) {
        lastPaint = now;
        originalSetBlips(withTarget(game.minimap.blips));
        if (activeJob) {
          const spec = JOBS[activeJob.type];
          setStatus(activeJob.type === "getaway"
            ? `Fuga: zere o nível de procurado · ${Math.ceil(activeJob.remaining)} s`
            : `${spec.title}: ${spec.noun} ${activeJob.index + 1}/${spec.stops} · ${Math.ceil(activeJob.remaining)} s`);
        }
        refresh();
      }
    }
    requestAnimationFrame(update);
  };

  refresh();
  requestAnimationFrame(update);
}

function waitForGame(attempt = 0) {
  if (window.game?.world && window.game?.economy && window.game?.minimap) {
    attach(window.game);
    return;
  }
  if (attempt >= 300) {
    console.warn("Os trabalhos extras não foram iniciados porque o jogo não ficou pronto.");
    return;
  }
  window.setTimeout(() => waitForGame(attempt + 1), 100);
}

waitForGame();
