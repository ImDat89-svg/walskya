const STORAGE_KEYS = {
  nick: "walskya-multiplayer-nick",
  server: "walskya-multiplayer-server"
};
const isLocalPage = location.protocol === "file:" ||
  ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const DEFAULT_SERVER = isLocalPage
  ? "ws://localhost:3002/ws"
  : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`;
const SEND_INTERVAL = 67;
const PLAYER_COLORS = ["#38e7ff", "#ff72bd", "#a9f56f", "#ffb84d", "#b99aff", "#f5ef66", "#69a8ff", "#ff8068"];

function colorForNick(nick) {
  let hash = 2166136261;
  for (const character of nick) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return PLAYER_COLORS[(hash >>> 0) % PLAYER_COLORS.length];
}

function readSetting(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (error) {
    console.warn("Não foi possível ler as configurações multiplayer.", error);
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Não foi possível salvar as configurações multiplayer.", error);
  }
}

function createInterface() {
  const root = document.createElement("section");
  root.id = "multiplayer-ui";
  root.innerHTML = `
    <button class="multiplayer-toggle" type="button" aria-expanded="false">JOGAR ONLINE</button>
    <div class="multiplayer-panel" hidden>
      <label>Seu nick <input class="multiplayer-nick" maxlength="20" autocomplete="nickname" placeholder="Seu nome no jogo"></label>
      <label>Servidor <input class="multiplayer-server" maxlength="240" autocomplete="url" spellcheck="false"></label>
      <div class="multiplayer-actions">
        <button class="multiplayer-connect" type="button">CONECTAR</button>
        <button class="multiplayer-disconnect" type="button" hidden>SAIR</button>
      </div>
      <p class="multiplayer-status" role="status">Desconectado</p>
      <ul class="multiplayer-roster" aria-label="Jogadores online"></ul>
    </div>
    <div class="multiplayer-labels" aria-hidden="true"></div>
  `;
  document.body.appendChild(root);
  root.addEventListener("keydown", (event) => event.stopPropagation());
  root.addEventListener("keyup", (event) => event.stopPropagation());

  const panel = root.querySelector(".multiplayer-panel");
  const toggle = root.querySelector(".multiplayer-toggle");
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  return {
    root,
    panel,
    toggle,
    nick: root.querySelector(".multiplayer-nick"),
    server: root.querySelector(".multiplayer-server"),
    connect: root.querySelector(".multiplayer-connect"),
    disconnect: root.querySelector(".multiplayer-disconnect"),
    status: root.querySelector(".multiplayer-status"),
    roster: root.querySelector(".multiplayer-roster"),
    labels: root.querySelector(".multiplayer-labels")
  };
}

function install(game, ui) {
  const peers = new Map();
  const map = game.minimap;
  let socket = null;
  let lastSent = 0;
  let lastFrame = performance.now();
  let localId = null;
  let localNick = "";
  let rememberedError = "";
  let shouldReconnect = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let reconnectEndpoint = null;
  let reconnectNick = "";
  let labelsFrame = 0;
  let rosterSignature = "";

  if (map?.setBlips && map?.update) {
    const originalSetBlips = map.setBlips;
    map.setBlips = function (blips) {
      const playerBlips = [...peers.values()]
        .filter((peer) => peer.player.ready)
        .map((peer) => ({
          x: peer.player.x,
          z: peer.player.z,
          kind: "dot",
          color: peer.color,
          r: 5
        }));
      return originalSetBlips.call(this, [...(blips ?? []), ...playerBlips]);
    };

    const originalUpdate = map.update;
    map.update = function (...args) {
      const result = originalUpdate.apply(this, args);
      if (!this.big || !this._player) return result;

      const ctx = this.ctx;
      const ratio = this.el.width / this.size;
      const center = this.size / 2;
      const zoom = (0.4 + 1.6 * this.zoom) * this.scale;
      const angle = -this._yaw;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.beginPath();
      ctx.arc(center, center, center - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      if (localNick) {
        ctx.beginPath();
        ctx.arc(center, center, 4, 0, Math.PI * 2);
        ctx.fillStyle = colorForNick(localNick);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
        ctx.strokeText(`Você · ${localNick}`, center + 8, center - 7);
        ctx.fillStyle = colorForNick(localNick);
        ctx.fillText(`Você · ${localNick}`, center + 8, center - 7);
      }
      for (const peer of peers.values()) {
        if (!peer.player.ready) continue;
        const x = (peer.player.x - this._player.x * this.zoom) * zoom;
        const z = (this._player.z * this.zoom - peer.player.z) * zoom;
        let mapX = center + x * cos - z * sin;
        let mapY = center + x * sin + z * cos;
          const dx = mapX - center;
          const dy = mapY - center;
          const distance = Math.hypot(dx, dy);
          if (distance > center - 10) {
            mapX = center + dx / distance * (center - 10);
            mapY = center + dy / distance * (center - 10);
          }

          const name = peer.player.nick;
          ctx.textAlign = mapX > center ? "right" : "left";
          const textX = mapX + (mapX > center ? -8 : 8);
          const textY = Math.max(12, Math.min(this.size - 12, mapY - 7));
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
          ctx.strokeText(name, textX, textY);
          ctx.fillStyle = peer.color;
          ctx.fillText(name, textX, textY);
      }
      ctx.restore();
      return result;
    };
  }

  ui.nick.value = readSetting(STORAGE_KEYS.nick, "");
  const savedServer = readSetting(STORAGE_KEYS.server, DEFAULT_SERVER);
  try {
    const server = new URL(savedServer);
    if (
      !isLocalPage &&
      ["localhost", "127.0.0.1", "::1"].includes(server.hostname) &&
      server.port === "3002" &&
      server.pathname === "/ws"
    ) {
      server.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      server.host = location.host;
      server.pathname = "/api/ws";
      saveSetting(STORAGE_KEYS.server, server.href);
    }
    if (
      server.hostname === (location.hostname || "localhost") &&
      server.port === "3001" &&
      server.pathname === "/ws"
    ) {
      server.port = "3002";
      saveSetting(STORAGE_KEYS.server, server.href);
    }
    ui.server.value = server.href;
  } catch (error) {
    console.warn("Endereço do servidor salvo é inválido; usando o padrão.", error);
    ui.server.value = DEFAULT_SERVER;
  }

  function setStatus(message, connected = false) {
    ui.status.textContent = message;
    ui.status.dataset.connected = String(connected);
    ui.toggle.dataset.connected = String(connected);
  }

  function removePeers() {
    for (const peer of peers.values()) {
      game.scene.remove(peer.group);
      peer.label.remove();
    }
    peers.clear();
    ui.roster.replaceChildren();
    rosterSignature = "";
    map?.setBlips?.([]);
    map?.legend?.querySelectorAll(".multiplayer-map-player").forEach((item) => item.remove());
  }

  function disconnect(message = "Desconectado") {
    shouldReconnect = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket) {
      const activeSocket = socket;
      socket = null;
      activeSocket.close();
    }
    localId = null;
    localNick = "";
    removePeers();
    ui.connect.hidden = false;
    ui.disconnect.hidden = true;
    ui.toggle.textContent = "JOGAR ONLINE";
    setStatus(message);
  }

  function makePeer(player) {
    const source = player.vehicle
      ? game._car?.group
      : game.world?.player?.group;
    if (!source) return null;

    const metadata = [];
    source.traverse((object) => {
      metadata.push([object, object.userData]);
      object.userData = {};
    });
    let group;
    try {
      group = source.clone(true);
    } catch (error) {
      console.error("Não foi possível criar o personagem multiplayer.", error);
      setStatus("Não foi possível criar o personagem de outro jogador.");
      return null;
    } finally {
      for (const [object, userData] of metadata) object.userData = userData;
    }

    group.visible = false;
    group.traverse((object) => {
      object.userData = { ...object.userData, multiplayerRemote: true };
    });
    game.scene.add(group);

    const label = document.createElement("span");
    label.className = "multiplayer-player-label";
    ui.labels.appendChild(label);

    return { group, label, vehicle: player.vehicle, player, color: colorForNick(player.nick) };
  }

  function updateRoster(players) {
    const online = players.filter((player) => player.ready);
    const sorted = online.slice().sort((a, b) => a.nick.localeCompare(b.nick, "pt-BR"));
    const signature = sorted.map((player) => player.nick).join("\n");
    if (signature !== rosterSignature) {
      rosterSignature = signature;
      ui.roster.replaceChildren(...sorted.map((player) => {
        const item = document.createElement("li");
        item.textContent = player.nick;
        return item;
      }));
      map?.legend?.querySelectorAll(".multiplayer-map-player").forEach((item) => item.remove());
      for (const player of sorted) {
        const item = document.createElement("span");
        item.className = "multiplayer-map-player";
        const marker = document.createElement("i");
        marker.setAttribute("aria-hidden", "true");
        Object.assign(marker.style, {
          display: "inline-block",
          width: "9px",
          height: "9px",
          marginRight: "0.35em",
          borderRadius: "50%",
          background: colorForNick(player.nick),
          boxShadow: "0 0 0 1px #fff"
        });
        item.append(marker, document.createTextNode(player.nick));
        map?.legend?.appendChild(item);
      }
    }
    ui.toggle.textContent = `ONLINE · ${online.length}`;
  }

  function applySnapshot(players) {
    const currentIds = new Set(players.filter((player) => player.id !== localId).map((player) => player.id));
    for (const [id, peer] of peers) {
      if (!currentIds.has(id)) {
        game.scene.remove(peer.group);
        peer.label.remove();
        peers.delete(id);
      }
    }

    for (const player of players) {
      if (player.id === localId) continue;

      let peer = peers.get(player.id);
      if (!peer || peer.vehicle !== player.vehicle) {
        if (peer) {
          game.scene.remove(peer.group);
          peer.label.remove();
        }
        peer = makePeer(player);
        if (!peer) continue;
        peers.set(player.id, peer);
      }

      peer.player = player;
      peer.group.visible = player.ready;
      peer.label.textContent = player.nick;
      peer.label.hidden = !player.ready;
      if (!player.ready) {
        peer.initialized = false;
        continue;
      }

      if (!peer.initialized) {
        peer.group.position.set(player.x, player.y, player.z);
        peer.group.rotation.y = player.yaw;
        peer.initialized = true;
      }
      peer.target = player;
    }

    updateRoster(players.filter((player) => player.ready));
  }

  function scheduleReconnect() {
    if (!shouldReconnect || rememberedError || reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);
    reconnectAttempts = Math.min(reconnectAttempts + 1, 4);
    ui.connect.hidden = true;
    ui.disconnect.hidden = false;
    setStatus(`Conexão interrompida. Reconectando em ${Math.ceil(delay / 1000)} s...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openConnection(reconnectEndpoint, reconnectNick);
    }, delay);
  }

  function openConnection(endpoint, nick) {
    if (!shouldReconnect || socket) return;
    setStatus("Conectando...");
    let connection;
    try {
      connection = new WebSocket(endpoint);
    } catch (error) {
      setStatus(`Não foi possível conectar: ${error.message}`);
      scheduleReconnect();
      return;
    }

    socket = connection;
    connection.addEventListener("open", () => {
      if (socket !== connection) return;
      connection.send(JSON.stringify({ type: "join", nick }));
      setStatus("Entrando na cidade...");
    });
    connection.addEventListener("message", (event) => {
      if (socket !== connection) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        console.error("Resposta multiplayer inválida.", error);
        setStatus("O servidor enviou uma resposta inválida.");
        return;
      }

      if (message.type === "joined") {
        localId = message.id;
        localNick = nick;
        reconnectAttempts = 0;
        ui.connect.hidden = true;
        ui.disconnect.hidden = false;
        ui.panel.hidden = true;
        ui.toggle.setAttribute("aria-expanded", "false");
        setStatus("Conectado. Entre no jogo para aparecer na cidade.", true);
      } else if (message.type === "snapshot" && Array.isArray(message.players)) {
        applySnapshot(message.players);
        setStatus(`Conectado · ${message.players.filter((player) => player.ready).length} jogador(es) online`, true);
      } else if (message.type === "error") {
        rememberedError = message.message || "Falha ao entrar na sala.";
        setStatus(rememberedError);
      }
    });
    connection.addEventListener("close", (event) => {
      if (socket !== connection) return;
      socket = null;
      localId = null;
      localNick = "";
      removePeers();
      ui.connect.hidden = false;
      ui.disconnect.hidden = true;
      ui.toggle.textContent = "JOGAR ONLINE";
      if (rememberedError) {
        shouldReconnect = false;
        setStatus(rememberedError);
      } else if (shouldReconnect) {
        scheduleReconnect();
      } else {
        setStatus(event.code === 1006
          ? "Conexão perdida. Confira o endereço e tente novamente."
          : "Desconectado.");
      }
    });
    connection.addEventListener("error", () => {
      if (socket === connection) setStatus("Falha na conexão. Confira o servidor e tente novamente.");
    });
  }

  function connect() {
    if (socket) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      shouldReconnect = false;
    }
    const nick = ui.nick.value.trim();
    const address = ui.server.value.trim();
    if (!nick) {
      setStatus("Digite um nick para entrar.");
      ui.nick.focus();
      return;
    }

    let endpoint;
    try {
      endpoint = new URL(address);
      if (!["ws:", "wss:"].includes(endpoint.protocol) || !endpoint.hostname) {
        throw new Error("URL inválida");
      }
      if (location.protocol === "https:" && endpoint.protocol !== "wss:" && !["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname)) {
        throw new Error("Use um endereço wss:// nesta página segura.");
      }
    } catch (error) {
      setStatus(error.message === "URL inválida" ? "Informe um endereço ws:// ou wss:// válido." : error.message);
      return;
    }

    saveSetting(STORAGE_KEYS.nick, nick);
    saveSetting(STORAGE_KEYS.server, endpoint.href);
    reconnectEndpoint = endpoint;
    reconnectNick = nick;
    rememberedError = "";
    shouldReconnect = true;
    reconnectAttempts = 0;
    openConnection(endpoint, nick);
  }

  ui.connect.addEventListener("click", connect);
  ui.disconnect.addEventListener("click", () => disconnect());
  ui.nick.addEventListener("keydown", (event) => {
    if (event.key === "Enter") connect();
  });

  setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !localId) return;
    const active = game.world?.active;
    const position = active?.group?.position;
    if (!active || !position) return;
    const now = performance.now();
    if (now - lastSent < SEND_INTERVAL) return;
    lastSent = now;
    socket.send(JSON.stringify({
      type: "state",
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: active.group.rotation.y,
      vehicle: active !== game.world.player,
      ready: game.state !== "menu"
    }));
  }, 33);

  function updateLabels() {
    labelsFrame = requestAnimationFrame(updateLabels);
    if (!game.camera) return;
    const now = performance.now();
    const smoothing = 1 - Math.exp(-18 * Math.min(now - lastFrame, 100) / 1000);
    lastFrame = now;
    game.camera.updateMatrixWorld();
    for (const peer of peers.values()) {
      const player = peer.player;
      if (!player.ready || !peer.group.visible) continue;
      if (peer.target) {
        peer.group.position.lerp(peer.target, smoothing);
        const yawDelta = Math.atan2(
          Math.sin(peer.target.yaw - peer.group.rotation.y),
          Math.cos(peer.target.yaw - peer.group.rotation.y)
        );
        peer.group.rotation.y += yawDelta * smoothing;
      }
      const anchor = peer.group.position.clone();
      anchor.y += player.vehicle ? 2.8 : 2.3;
      anchor.project(game.camera);
      const visible = anchor.z >= -1 && anchor.z <= 1 &&
        Math.abs(anchor.x) <= 1.15 && Math.abs(anchor.y) <= 1.15;
      peer.label.hidden = !visible;
      if (!visible) continue;
      peer.label.style.left = `${(anchor.x * 0.5 + 0.5) * innerWidth}px`;
      peer.label.style.top = `${(-anchor.y * 0.5 + 0.5) * innerHeight}px`;
    }
  }
  updateLabels();

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(labelsFrame);
    shouldReconnect = false;
    clearTimeout(reconnectTimer);
    socket?.close();
  }, { once: true });
}

function waitForGame() {
  if (!window.game?.world?.player?.group || !window.game.scene) {
    setTimeout(waitForGame, 250);
    return;
  }
  install(window.game, createInterface());
}

waitForGame();
