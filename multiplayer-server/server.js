import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { attachRoom } from "./room.js";

const port = Number(process.env.PORT) || 3002;

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", players: room.getPlayerCount() }));
    return;
  }

  response.writeHead(404);
  response.end("Not found");
});

const webSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: 1024
});

httpServer.on("upgrade", (request, socket, head) => {
  if (request.url !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (client) => {
    webSocketServer.emit("connection", client);
  });
});

const room = attachRoom(webSocketServer);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Walskya multiplayer server listening on port ${port}`);
});
