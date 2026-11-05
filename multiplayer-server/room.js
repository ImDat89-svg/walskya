import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const maxPlayers = 32;
const updateInterval = 50;

export function attachRoom(webSocketServer) {
  const players = new Map();
  let dirty = false;

  function send(client, message) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  function broadcastSnapshot() {
    const snapshot = {
      type: "snapshot",
      players: [...players.values()].map(({ id, nick, state }) => ({
        id,
        nick,
        ...state
      }))
    };

    for (const client of webSocketServer.clients) {
      if (client.playerId) send(client, snapshot);
    }
  }

  webSocketServer.on("connection", (client) => {
    client.isAlive = true;
    client.playerId = null;
    client.lastUpdate = 0;
    client.on("pong", () => {
      client.isAlive = true;
    });

    client.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        client.close(1007, "Invalid JSON");
        return;
      }

      if (!message || typeof message !== "object" || Array.isArray(message)) {
        client.close(1007, "Invalid message");
        return;
      }

      if (!client.playerId && message.type === "join") {
        const nick = typeof message.nick === "string"
          ? Array.from(message.nick.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim()).slice(0, 20).join("")
          : "";

        if (!nick) {
          send(client, { type: "error", message: "Digite um nick válido." });
          client.close(1008, "Invalid nickname");
          return;
        }

        if (players.size >= maxPlayers) {
          send(client, { type: "error", message: "A sala está cheia. Tente novamente mais tarde." });
          client.close(1013, "Room full");
          return;
        }

        const duplicate = [...players.values()].some((player) => (
          player.nick.toLocaleLowerCase("pt-BR") === nick.toLocaleLowerCase("pt-BR")
        ));
        if (duplicate) {
          send(client, { type: "error", message: "Esse nick já está sendo usado. Escolha outro." });
          client.close(1008, "Nickname in use");
          return;
        }

        const id = randomUUID();
        client.playerId = id;
        players.set(id, {
          id,
          nick,
          state: { x: 0, y: 0, z: 0, yaw: 0, vehicle: false, ready: false }
        });
        send(client, { type: "joined", id });
        dirty = true;
        return;
      }

      if (!client.playerId || message.type !== "state") {
        send(client, { type: "error", message: "Mensagem multiplayer inválida." });
        client.close(1008, "Unexpected message");
        return;
      }

      const now = Date.now();
      if (now - client.lastUpdate < updateInterval) return;

      const { x, y, z, yaw, vehicle, ready } = message;
      if (
        ![x, y, z, yaw].every(Number.isFinite) ||
        Math.abs(x) > 10000 || Math.abs(y) > 10000 ||
        Math.abs(z) > 10000 || Math.abs(yaw) > 1000 ||
        typeof vehicle !== "boolean" || typeof ready !== "boolean"
      ) {
        send(client, { type: "error", message: "Posição do jogador inválida." });
        client.close(1008, "Invalid player state");
        return;
      }

      client.lastUpdate = now;
      const player = players.get(client.playerId);
      if (player) {
        player.state = { x, y, z, yaw, vehicle, ready };
        dirty = true;
      }
    });

    client.on("close", () => {
      if (client.playerId && players.delete(client.playerId)) dirty = true;
    });

    client.on("error", (error) => {
      console.error("WebSocket client error:", error.message);
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of webSocketServer.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30000);

  const snapshots = setInterval(() => {
    if (dirty) {
      broadcastSnapshot();
      dirty = false;
    }
  }, updateInterval);

  heartbeat.unref();
  snapshots.unref();
  return { getPlayerCount: () => players.size };
}
