import type { SessionData } from 'express-session';
import type { Socket } from 'socket.io';
import type * as http from 'http';
import type { SessionUser } from './index.js';

declare module 'express-session' {
  interface SessionData {
    user?: any;
    sessionId?: string;
    id?: string;
    save(): void;
    destroy(): void;
  }
}

declare global {
  namespace Express {
    interface Request {
      session?: SessionData;
      user?: any;
    }
  }

  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL?: string;
      PORT?: string;
    }
  }
}

declare module 'http' {
  interface IncomingMessage {
    session?: {
      user?: any;
      sessionId?: string;
      id?: string;
      save(): void;
      destroy(): void;
    };
    user?: any;
  }
}

declare module 'socket.io' {
  interface Socket {
    request: http.IncomingMessage & {
      session?: {
        user?: any;
        sessionId?: string;
        id?: string;
        save(): void;
        destroy(): void;
      };
      user?: any;
    };
    deviceId?: string;
  }
}
