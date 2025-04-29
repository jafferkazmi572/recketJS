# 🚀 RecketJS Server

**RecketJS** is a lightweight, scalable WebSocket server library that brings Socket.IO-like features with a modular, low-level control approach. It supports:

- 🔌 Namespaces  
- 🧠 Middleware (connection & event-level)  
- 📩 Custom request-response handling  
- 🏠 Room-based broadcasting  
- 🔒 Server-to-client and client-to-server secure request support

---

## 📦 Installation

### NPM
```bash
npm install recketjs
```

### Yarn
```bash
yarn add recketjs
```


## 📄 License

This project is licensed under the [Apache License 2.0](./LICENSE) © 2025 [jafferkazmi572](https://github.com/jafferkazmi572).


## 🧪 Getting Started

### Basic Setup
```javascript
import { RacketServer } from "recketjs";
import http from "http";

const server = http.createServer();
const io = new RacketServer({server, path: "/recket" });

const chatNamespace = io.of("/chat");

chatNamespace.on("connection", (socket) => {
  console.log("✅ Client connected to /chat");

  socket.on("say_hello", (data) => {
    console.log("Client says:", data);
    socket.emit("server_greet", { message: "Hello from server!" });
  });

  socket.onRequest("get_user", async (data, response) => {
    if(data.userId)
      response( { id: data.userId, name: "Ali" });
    else
      response(null,{code:401,message:'unauthorized'})
  });
});

server.listen(3000, () => {
  console.log("🚀 Server listening on port 3000");
});
```

## 🧠 Features

### ✅ Namespaces

```javascript
const chat = io.of("/chat");
const admin = io.of("/admin");
```

### 🔗 Middleware Support
#### Connection Middleware
```javascript
chat.useConnection(async (socket, next) => {
  const token = socket.query.token;
  if (token !== "xyz") return next(new Error("Unauthorized"));
  next();
});
```

#### Event-Level Middleware
```javascript
chat.use("say_hello", async (socket, data, next) => {
  if (!data.name) return next("Missing name");
  next();
});
```

### 🔁 Request-Response System

#### Client Request → Server Response

 - Below is server declaration
```javascript
socket.onRequest("get_user", async (data, response) => {
    if(data.userId)
      response( { id: data.userId, name: "Ali" });
    else
      response(null,{code:401,message:'unauthorized'})
  });
```
 - Below is client requesting

```javascript
await socket.request("get_user", { time: Date.now() });
```

#### Server Request → Client Response

- Below is client declaration
```javascript
socket.onRequest("ping", async (data, response) => {
   response({ message: 'I am Here...' });
});
```

- Below is server requesting
```javascript
await socket.request("ping", { time: Date.now() });
```
- The client must explicitly enable handling of server-initiated requests.

### 🔐 Secure Server-to-Client Requests
To prevent abuse, the server can only request the client if:
- The server is running on localhost, or
- Clients must explicitly enable handling of server-initiated requests using .enableServerRequests().

This means the client needs to call `.enableServerRequests()` before the server can request any data from the client.

### 🏠 Room-based Broadcasting

```javascript
socket.join("room1"); // Join a room
chatNamespace.to("room1").emit("room_message", { msg: "Hello Room!" }); // Broadcast to all sockets in the room
```


### 📄 Query Parameters
- Client can connect with query:

```javascript
ws://localhost:3000/recket/chat?token=xyz
```

- Accessible via:
```javascript
socket.query.token;
```

## 🧰 API Overview

### RacketServer
```javascript
let rs = new RacketServer({server:httpServer, path: "/recket" });
rs.of("/namespace");
```

### RacketNamespace
```javascript
namespace.useConnection(fn);
namespace.use("event", fn);
namespace.on("connection", (socket) => {});
namespace.to("room").emit(...);
```

### RacketSocket
```javascript
socket.id
socket.emit("event", data);
socket.on("event", handler);
socket.onRequest("endpoint", async (data) => {});
socket.request("endpoint", data);
socket.join("room");
socket.leave("room");
```

### 🧑‍💻 Dev Notes
 - Compatible with any Node HTTP server

 - Use structured namespaces for scaling

 - Built for full control over WebSocket behavior


### 🧠 Author
Crafted with 💙 for devs who love event-driven systems and want the power of WebSockets with better control.