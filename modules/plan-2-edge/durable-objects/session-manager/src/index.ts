// Session Manager Durable Object
import { Env } from '../../../shared/types/env';

interface Session {
  id: string;
  userId: string;
  deviceId: string;
  createdAt: number;
  lastActivity: number;
  metadata?: Record<string, any>;
}

export class SessionManager implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/create':
          return await this.handleCreateSession(request);
        case '/get':
          return await this.handleGetSession(request);
        case '/update':
          return await this.handleUpdateSession(request);
        case '/delete':
          return await this.handleDeleteSession(request);
        case '/list':
          return await this.handleListSessions(request);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Session manager error:', error);
      return new Response(JSON.stringify({
        error: 'Internal error',
        message: (error as Error).message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleCreateSession(request: Request): Promise<Response> {
    const { userId, deviceId, metadata } = await request.json() as {
      userId: string;
      deviceId: string;
      metadata?: Record<string, any>;
    };

    const sessionId = crypto.randomUUID();
    const session: Session = {
      id: sessionId,
      userId,
      deviceId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      metadata
    };

    // Store session
    await this.storage.put(`session:${sessionId}`, session);

    // Store user -> session mapping
    const userSessions = await this.storage.get<string[]>(`user:${userId}:sessions`) || [];
    userSessions.push(sessionId);
    await this.storage.put(`user:${userId}:sessions`, userSessions);

    return new Response(JSON.stringify({
      success: true,
      sessionId,
      session
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetSession(request: Request): Promise<Response> {
    const { sessionId } = await request.json() as { sessionId: string };

    const session = await this.storage.get<Session>(`session:${sessionId}`);
    
    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      session
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUpdateSession(request: Request): Promise<Response> {
    const { sessionId, metadata } = await request.json() as {
      sessionId: string;
      metadata?: Record<string, any>;
    };

    const session = await this.storage.get<Session>(`session:${sessionId}`);
    
    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update session
    session.lastActivity = Date.now();
    if (metadata) {
      session.metadata = { ...session.metadata, ...metadata };
    }

    await this.storage.put(`session:${sessionId}`, session);

    return new Response(JSON.stringify({
      success: true,
      session
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleDeleteSession(request: Request): Promise<Response> {
    const { sessionId } = await request.json() as { sessionId: string };

    const session = await this.storage.get<Session>(`session:${sessionId}`);
    
    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete session
    await this.storage.delete(`session:${sessionId}`);

    // Remove from user sessions list
    const userSessions = await this.storage.get<string[]>(`user:${session.userId}:sessions`) || [];
    const filtered = userSessions.filter(id => id !== sessionId);
    await this.storage.put(`user:${session.userId}:sessions`, filtered);

    return new Response(JSON.stringify({
      success: true,
      deleted: sessionId
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleListSessions(request: Request): Promise<Response> {
    const { userId } = await request.json() as { userId: string };

    const sessionIds = await this.storage.get<string[]>(`user:${userId}:sessions`) || [];
    const sessions: Session[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.storage.get<Session>(`session:${sessionId}`);
      if (session) {
        sessions.push(session);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sessions,
      count: sessions.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Export for Cloudflare Workers
export default {
  SessionManager
};