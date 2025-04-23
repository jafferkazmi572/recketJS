/**
 * @license
 * Apache-2.0
 * Copyright (c) 2025 jafferkazmi572
 */
import { IncomingMessage } from "http";
import WebSocket from "ws";
import RecketSocket from "./socket";

type EventHandler = (socket: RecketSocket, data?: any) => void;
type MiddlewareFn = (socket: RecketSocket, next: (err?: Error) => void) => void;

class RecketNamespace {
    public readonly path: string;
    private sockets: Set<RecketSocket> = new Set();
    private rooms: Map<string, Set<RecketSocket>> = new Map();
    private events: Map<string, EventHandler> = new Map();
    private connectionMiddlewares: MiddlewareFn[] = [];

    constructor(path: string) {
        this.path = path;
    }

    handleConnection(ws: WebSocket, req: IncomingMessage, path: string, query: Record<string, string>) {
        const socket = new RecketSocket(ws, {
            joinRoom: this.addSocketToRoom.bind(this),
            leaveRoom: this.removeSocketFromRoom.bind(this)
        }, { path, query });

        this.sockets.add(socket);

        this.runMiddlewares(socket, (err) => {
            if (err) {
                ws.close();
                return;
            }

            this.events.get("connection")?.(socket);
            socket.emit('__handshake_ack', { message: `Connected to ${path}` });

            ws.on("close", () => {
                this.sockets.delete(socket);
            });
        });
    }

    on(event: string, handler: EventHandler) {
        this.events.set(event, handler);
    }

    useConnection(middleware: MiddlewareFn) {
        this.connectionMiddlewares.push(middleware);
    }

    to(room: string, event: string, data: any) {
        if (this.rooms.has(room)) {
            this.rooms.get(room)!.forEach((socket) => socket.emit(event, data));
        }
    }

    private addSocketToRoom(roomId: string, socket: RecketSocket) {
        if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
        this.rooms.get(roomId)!.add(socket);
    }

    private removeSocketFromRoom(roomId: string, socket: RecketSocket) {
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId)!.delete(socket);
            if (this.rooms.get(roomId)!.size === 0) this.rooms.delete(roomId);
        }
    }

    private runMiddlewares(socket: RecketSocket, done: (err?: Error) => void, index = 0) {
        if (index >= this.connectionMiddlewares.length) return done();
        const middleware = this.connectionMiddlewares[index];
        middleware(socket, (err) => {
            if (err) return done(err);
            this.runMiddlewares(socket, done, index + 1);
        });
    }
}

export default RecketNamespace;
