import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { attachRoom } from "../multiplayer-server/room.js";

const server = createServer((_request, response) => {
  response.writeHead(426, { "content-type": "text/plain" });
  response.end("Upgrade to WebSocket required");
});
const webSocketServer = new WebSocketServer({
  server,
  path: "/api/ws",
  maxPayload: 1024
});

attachRoom(webSocketServer);

export default server;
