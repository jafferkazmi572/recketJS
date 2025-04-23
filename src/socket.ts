import WebSocket from "ws";

type EventHandler = (data: any) => void;

class RecketSocket {
    private ws: WebSocket;
    private events: Map<string, EventHandler> = new Map();
    private requestHandlers: Map<string, (data: any, respond: (data: any, error?:  { code: number; message: string }) => void) => void> = new Map();
    private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
    private middlewares: ((event: string, data: any, next: (error?: any) => void) => void)[] = [];
    private joinedRooms: Set<string> = new Set();
    public id: string;
    private serverMethods: {
        joinRoom: (roomId: string, socket: RecketSocket) => void;
        leaveRoom: (roomId: string, socket: RecketSocket) => void;
    };
    public query: Record<string, string>;
    public path: string;

    constructor(ws: WebSocket, serverMethods: any,{ path, query }: { path: string, query: Record<string, string> }) {
        this.ws = ws;
        this.id = Math.random().toString(36).substr(2, 9);
        this.serverMethods = serverMethods
        this.query = query;
        this.path = path;
        
        this.ws.on("message", (message: any) => {
            try {
                const { event, data, request, response } = JSON.parse(message.toString());
                if(request?.id && request?.endpoint){
                    this.handleIncomingRequest({id: request?.id,endpoint:request?.endpoint,data:request?.data})
                }
                else if (response?.id && (response?.data || response?.error))
                    this.handleIncomingResponse({id:response?.id,data:response?.data,error:response?.error})
                else if (this.events.has(event)) {
                    this.runMiddlewares(event, data, (err) => {
                        if (err) {
                            // Optional: You can emit an error event back if needed
                            console.warn(`Event "${event}" blocked by middleware:`, err);
                            return;
                        }
                        this.events.get(event)!(data);
                    });
                }
            } catch (error) {
                console.error("Invalid message format", error);
            }
        });

        this.ws.on("close", () => {
            if (this.events.has("disconnect")) {
                this.events.get("disconnect")!(null);
            }
            this.pendingRequests.forEach(({ reject,timeout }) => {
                clearTimeout(timeout);
                reject({ code: 503, message: "WebSocket connection closed" });
            });
            this.pendingRequests.clear();

            this.joinedRooms?.forEach(roomId => this.leave(roomId));
            
        });
    }

    on(event: string, handler: EventHandler) {
        this.events.set(event, handler);
    }

    emit(event: string, data: any) {
        this.ws.send(JSON.stringify({ event, data }));
    }

    join(roomId: string) {
        if (!this.joinedRooms.has(roomId)) {
            this.serverMethods?.joinRoom(roomId, this);
            this.joinedRooms.add(roomId);
        }
    }

    leave(roomId: string) {
        this.serverMethods?.leaveRoom(roomId, this);
        this.joinedRooms.delete(roomId);
    }

    use(middleware: (event: string, data: any, next: (err?: any) => void) => void) {
        this.middlewares.push(middleware);
    }

    registerRequestHandler(endpoint: string, handler: (data: any, respond: (data: any, error?:  { code: number; message: string }) => void) => void) {
        if (this.requestHandlers.has(endpoint)) {
            throw new Error(`Endpoint "${endpoint}" is already registered.`);
        }
        this.requestHandlers.set(endpoint, handler);
    }

    private handleIncomingRequest(request: { id: string; endpoint: string; data: any }) {
        const { id, endpoint, data } = request;
        const handler = this.requestHandlers.get(endpoint);
        if (!handler) {
            console.warn(`No handler registered for endpoint: ${endpoint}`);
            this.sendResponse(id, null,{code:404, message:`No handler registered for endpoint: ${endpoint}`});
            return;
        }
    
        try {
            // User will handle response manually
           handler(data, (responseData, error) => {
                this.sendResponse(id, responseData, error);
            });
        } catch (error: any) {
            this.sendResponse(id, null, { code:500, message: error.message || "Unknown error"});
        }
    }

    private sendResponse(id: string, data: any, error?: { code: number; message: string }) {
        this.ws.send(JSON.stringify({response:{ id, data, error }}));
    }

    private handleIncomingResponse(response: { id: string; data: any; error?: { code: number; message: string } }) {
        const { id, data, error } = response;
    
        if (this.pendingRequests.has(id)) {
            const { resolve, reject, timeout } = this.pendingRequests.get(id)!;
            clearTimeout(timeout)
            this.pendingRequests.delete(id);
    
            if (error) {
                const err = new Error(error.message || "Unknown Error");
                (err as any).code = error.code || 500; 
                reject(err);
            } else {
                resolve(data);
            }
        }
    }

        request(endpoint: string, data: any, timeoutDuration: number =300000): Promise<any> {
        return new Promise((resolve, reject) => {

            if (this.ws.readyState !== WebSocket.OPEN) {
                reject({ code: 503, message: "WebSocket is not connected" });
                return;
            }

            const requestId =  Date.now() + Math.random().toString(36).substring(2, 10);

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeout)
                reject({ code: 408, message: "Request timed out" });
            }, timeoutDuration);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            try {
                this.ws.send(JSON.stringify({ request: { id: requestId, endpoint, data } }));
            } catch (err) {
                reject({ code: 500, message: "Failed to send request" });
            }
        });
    }

    private runMiddlewares(event: string, data: any, done: (err?: any) => void) {
        let i = 0;
        const next = (err?: any) => {
            if (err || i === this.middlewares.length) return done(err);
            const middleware = this.middlewares[i++];
            middleware(event, data, next);
        };
        next();
    }
}

export default RecketSocket;
