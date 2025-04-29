/**
 * @license
 * Apache-2.0
 * Copyright (c) 2025 jafferkazmi572
 */
import { WebSocketServer } from "ws";
import http from "http";
import RecketSocket  from "./socket";
import RecketNamespace from "./namespace";

type EventHandler = (socket: RecketSocket, data?: any) => void;

class RecketServer {
    private server: WebSocketServer;
    private connections: Set<RecketSocket> = new Set();
    private globalEvents: Map<string, EventHandler> = new Map();
    private rooms: Map<string, Set<RecketSocket>> = new Map();
    private connectionMiddlewares: Array<(socket: RecketSocket, next: (err?: Error) => void) => void> = [];
    private namespaces: Map<string, RecketNamespace> = new Map();
    private allowedPath?: string;

    constructor(options: { port?: number; server?: http.Server, path?:string }) {
        if (options.server && options.port) {
            console.warn("Both port and server provided. Using the existing server.");
        }
        if(options.path && options.path!== '/'){
            this.allowedPath = options.path
        }
        if (options.server) {
            this.server = new WebSocketServer({ noServer: true });
            options.server.on("upgrade", (req, socket, head) => {
                const parsedUrl = new URL(req?.url!, `http://${req?.headers?.host}`);
                const fullPath = parsedUrl?.pathname && parsedUrl?.pathname !== '/'? parsedUrl?.pathname : "/recket";
                const path = fullPath.split("/")[1];
                const normalizedAllowedPath = this.allowedPath?.replace(/^\//, '');
                if(this.allowedPath && normalizedAllowedPath !== path) {
                    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
                    socket.destroy();
                    return;
                }
                const pathNamespace =fullPath.split("/")[2]
                const query: Record<string, string> = {};
                parsedUrl.searchParams.forEach((value, key) => {
                    query[key] = value;
                });
            
                this.server.handleUpgrade(req, socket, head, (ws) => {
                    
                    if(pathNamespace){
                        const namespace = this.namespaces.get(pathNamespace);
                        if (namespace) {
                            namespace.handleConnection(ws, req, pathNamespace, query);
                            return;
                        }
                    }
                    const racketSocket = new RecketSocket(ws, {
                        joinRoom: this.addSocketToRoom.bind(this),
                        leaveRoom: this.removeSocketFromRoom.bind(this)
                    }, { path, query });
            
                    this.connections.add(racketSocket);
                
                    this.runConnectionMiddlewares(racketSocket, (err) => {
                        if (err) {
                            console.error("Connection middleware error:", err?.message);
                            ws.close();
                            return;
                        }
                        this.globalEvents.get("connection")?.(racketSocket);
                        racketSocket.emit('__system_handshake_ack',{message:"connected successfully!"})
                    });
        
                    ws.on("close", () => {
                        this.connections.delete(racketSocket);
                    });
                });
            });
            
        }
        else if (options.port) {
            this.server = new WebSocketServer({ port: options.port });
            this.server.on("connection", (ws,req) => {
                
                const parsedUrl = new URL(req?.url!, `http://${req?.headers?.host}`);
                const fullPath = parsedUrl?.pathname && parsedUrl?.pathname !== '/'? parsedUrl?.pathname : "/recket";
                const path = fullPath.split("/")[1];
                const normalizedAllowedPath = this.allowedPath?.replace(/^\//, '');
                if(this.allowedPath && normalizedAllowedPath !== path) {
                    ws.close(1008, "Invalid path");
                    return;
                }
                const pathNamespace =fullPath.split("/")[2]
                const query: Record<string, string> = {};
                parsedUrl.searchParams.forEach((value, key) => {
                    query[key] = value;
                });

                if(pathNamespace){
                    const namespace = this.namespaces.get(pathNamespace);
                    if (namespace) {
                        namespace.handleConnection(ws, req, pathNamespace, query);
                        return;
                    }
                }
                const socket = new RecketSocket(ws, {
                    joinRoom: this.addSocketToRoom.bind(this),
                    leaveRoom: this.removeSocketFromRoom.bind(this)
                }, { path, query });

                this.connections.add(socket);
                
                this.runConnectionMiddlewares(socket, (err) => {
                    if (err) {
                        console.error("Connection middleware error:", err?.message);
                        ws.close();
                        return;
                    }
                    this.globalEvents.get("connection")?.(socket);
                    socket.emit('__system_handshake_ack',{message:"connected successfully!"})
                });
    
                ws.on("close", () => {
                    this.connections.delete(socket);
                });
            });

        } 
        else {
            throw new Error("Port or existing HTTP server required.");
        }
    }

    on(event: string, handler: EventHandler) {
        this.globalEvents.set(event, handler);
    }

    addSocketToRoom(roomId: string, socket: RecketSocket) {
        if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
        this.rooms.get(roomId)!.add(socket);
    }

    removeSocketFromRoom(roomId: string, socket: RecketSocket) {
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId)!.delete(socket);
            if (this.rooms.get(roomId)!.size === 0) this.rooms.delete(roomId);
        }
    }

    to(room: string, event: string, data: any) {
        if (this.rooms.has(room)) {
            this.rooms.get(room)!.forEach((socket) => {
                socket.emit(event, data);
            });
        }
    }

    of(path: string): RecketNamespace {
        if (!this.namespaces.has(path)) {
            this.namespaces.set(path, new RecketNamespace(path));
        }
        return this.namespaces.get(path)!;
    }

    useConnection(middleware: (socket: RecketSocket, next: (err?: Error) => void) => void) {
        this.connectionMiddlewares.push(middleware);
    }

    private runConnectionMiddlewares(socket: RecketSocket, done: (err?: Error) => void, index: number = 0) {
        if (index >= this.connectionMiddlewares.length) {
            return done();
        }
    
        const middleware = this.connectionMiddlewares[index];
        middleware(socket, (err?: Error) => {
            if (err) return done(err);
            this.runConnectionMiddlewares(socket, done, index + 1);
        });
    }
    
}


export { RecketServer };