import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSharedModule } from "../../../helpers/load-shared-module.js";

// ── Load the module ─────────────────────────────────────────────────────────
const shared = loadSharedModule("packages/shared/sync-session-core.js", {
  crypto: {
    randomUUID: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 2 ** 32);
      return arr;
    },
  },
});
const createSyncSessionService = shared.createSyncSessionService;

// ── Transport mock factory ──────────────────────────────────────────────────
function createMockTransport() {
  const subscribers = new Map();
  let connectionStateCallback = null;

  return {
    createRoom: vi.fn().mockResolvedValue({
      sessionCode: "ABCD-1234",
      sessionName: "Test Session",
      hostClientId: "test-client",
      controlMode: "host-only",
      participantsCount: 1,
      participantIds: ["test-client"],
      participantProfiles: {},
      participantSyncStates: {},
      sessionPackMeta: null,
      sessionMediaMeta: null,
      sessionState: null,
    }),
    joinRoom: vi.fn().mockResolvedValue({
      sessionCode: "ABCD-1234",
      sessionName: "Test Session",
      hostClientId: "host-client",
      controlMode: "host-only",
      participantsCount: 2,
      participantIds: ["host-client", "test-client"],
      participantProfiles: {},
      participantSyncStates: {},
      sessionPackMeta: null,
      sessionMediaMeta: null,
      sessionState: null,
    }),
    leaveRoom: vi.fn().mockResolvedValue({ left: true }),
    updateRoom: vi.fn().mockResolvedValue({
      sessionCode: "ABCD-1234",
      sessionName: "Updated Session",
      hostClientId: "test-client",
      controlMode: "host-only",
      participantsCount: 1,
      participantIds: ["test-client"],
      participantProfiles: {},
      participantSyncStates: {},
    }),
    updateSessionState: vi.fn().mockResolvedValue({
      isPlaying: true,
      revision: 1,
    }),
    uploadSessionPack: vi.fn().mockResolvedValue({
      sessionCode: "ABCD-1234",
      sessionPackMeta: { hash: "abc", size: 100, uploadedBy: "test-client" },
    }),
    getSessionPack: vi.fn().mockResolvedValue({
      pack: { data: "test" },
      hash: "abc",
      updatedAt: 1000,
      size: 100,
    }),
    subscribe: vi.fn((code, callback) => {
      subscribers.set(code, callback);
      return () => subscribers.delete(code);
    }),
    onConnectionStateChange: vi.fn((cb) => {
      connectionStateCallback = cb;
    }),
    sendDrawingSync: vi.fn().mockResolvedValue(true),

    // Test helpers
    _emit(code, payload) {
      const cb = subscribers.get(code);
      if (cb) cb(payload);
    },
    _emitConnectionState(state) {
      if (connectionStateCallback) connectionStateCallback(state);
    },
  };
}

describe("sync-session-core", () => {
  describe("createSyncSessionService — factory", () => {
    it("devrait créer un service avec les méthodes attendues", () => {
      const svc = createSyncSessionService({ clientId: "test-id" });
      expect(typeof svc.getState).toBe("function");
      expect(typeof svc.getClientId).toBe("function");
      expect(typeof svc.subscribe).toBe("function");
      expect(typeof svc.hostSession).toBe("function");
      expect(typeof svc.joinSession).toBe("function");
      expect(typeof svc.leaveSession).toBe("function");
      expect(typeof svc.publishSessionState).toBe("function");
      expect(typeof svc.sendDrawingSync).toBe("function");
      expect(typeof svc.onDrawingSync).toBe("function");
      expect(typeof svc.offDrawingSync).toBe("function");
    });

    it("devrait utiliser le clientId fourni", () => {
      const svc = createSyncSessionService({ clientId: "my-client-42" });
      expect(svc.getClientId()).toBe("my-client-42");
    });

    it("devrait générer un clientId si non fourni", () => {
      const svc = createSyncSessionService({});
      expect(svc.getClientId()).toBeTruthy();
      expect(typeof svc.getClientId()).toBe("string");
    });
  });

  describe("état initial", () => {
    it("devrait avoir un état idle par défaut", () => {
      const svc = createSyncSessionService({ clientId: "c1" });
      const state = svc.getState();
      expect(state.status).toBe("idle");
      expect(state.role).toBe("none");
      expect(state.sessionCode).toBe("");
      expect(state.participantsCount).toBe(0);
      expect(state.participantIds).toEqual([]);
      expect(state.lastError).toBe("");
    });

    it("devrait inclure le clientId dans l'état", () => {
      const svc = createSyncSessionService({ clientId: "c1" });
      expect(svc.getState().clientId).toBe("c1");
    });
  });

  describe("subscribe", () => {
    it("devrait appeler le listener immédiatement avec l'état courant", () => {
      const svc = createSyncSessionService({ clientId: "c1" });
      const listener = vi.fn();
      svc.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: "idle" }),
      );
    });

    it("devrait retourner une fonction unsubscribe", () => {
      const svc = createSyncSessionService({ clientId: "c1" });
      const listener = vi.fn();
      const unsub = svc.subscribe(listener);
      expect(typeof unsub).toBe("function");
      listener.mockClear();
      unsub();
      // Après unsub, les changements ne devraient plus notifier
    });

    it("devrait ignorer les non-fonctions", () => {
      const svc = createSyncSessionService({ clientId: "c1" });
      const unsub = svc.subscribe("not a function");
      expect(typeof unsub).toBe("function"); // retourne un noop
    });
  });

  describe("hostSession", () => {
    let transport;
    let svc;

    beforeEach(() => {
      transport = createMockTransport();
      svc = createSyncSessionService({
        clientId: "host-1",
        transport,
      });
    });

    it("devrait passer en état hosting après succès", async () => {
      await svc.hostSession({
        sessionCode: "ABCD-1234",
        sessionName: "Ma Session",
      });
      const state = svc.getState();
      expect(state.status).toBe("hosting");
      expect(state.role).toBe("host");
      expect(state.sessionCode).toBe("ABCD-1234");
    });

    it("devrait appeler transport.createRoom", async () => {
      await svc.hostSession({
        sessionCode: "ABCD-1234",
        sessionName: "Test",
        controlMode: "host-only",
      });
      expect(transport.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionCode: "ABCD-1234",
          sessionName: "Test",
          controlMode: "host-only",
          hostClientId: "host-1",
        }),
      );
    });

    it("devrait rejeter avec invalid-session-code pour un code malformé", async () => {
      await expect(
        svc.hostSession({ sessionCode: "bad-code" }),
      ).rejects.toThrow("invalid-session-code");
    });

    it("devrait throw si pas de transport", async () => {
      const noTransportSvc = createSyncSessionService({ clientId: "c1" });
      await expect(noTransportSvc.hostSession({})).rejects.toThrow(
        "transport-unavailable",
      );
    });

    it("devrait notifier les subscribers pendant la transition connecting → hosting", async () => {
      const states = [];
      svc.subscribe((s) => states.push(s.status));
      states.length = 0; // clear initial emit

      await svc.hostSession({ sessionCode: "ABCD-1234" });
      expect(states).toContain("connecting");
      expect(states).toContain("hosting");
    });

    it("devrait revenir à idle si createRoom échoue", async () => {
      transport.createRoom.mockRejectedValueOnce(new Error("server-error"));
      await expect(
        svc.hostSession({ sessionCode: "ABCD-1234" }),
      ).rejects.toThrow("server-error");
      expect(svc.getState().status).toBe("idle");
      expect(svc.getState().lastError).toBe("server-error");
    });
  });

  describe("joinSession", () => {
    let transport;
    let svc;

    beforeEach(() => {
      transport = createMockTransport();
      svc = createSyncSessionService({
        clientId: "joiner-1",
        transport,
      });
    });

    it("devrait passer en état joined après succès", async () => {
      await svc.joinSession({
        sessionCode: "ABCD-1234",
        password: "secret",
      });
      const state = svc.getState();
      expect(state.status).toBe("joined");
      expect(state.role).toBe("participant");
      expect(state.sessionCode).toBe("ABCD-1234");
    });

    it("devrait rejeter avec missing-session-code si vide", async () => {
      await expect(svc.joinSession({})).rejects.toThrow("missing-session-code");
    });

    it("devrait rejeter avec invalid-session-code pour un code malformé", async () => {
      await expect(
        svc.joinSession({ sessionCode: "xyz" }),
      ).rejects.toThrow("invalid-session-code");
    });

    it("devrait revenir à idle si joinRoom échoue", async () => {
      transport.joinRoom.mockRejectedValueOnce(
        new Error("session-not-found"),
      );
      await expect(
        svc.joinSession({ sessionCode: "ABCD-1234" }),
      ).rejects.toThrow("session-not-found");
      expect(svc.getState().status).toBe("idle");
      expect(svc.getState().lastError).toBe("session-not-found");
    });
  });

  describe("leaveSession", () => {
    let transport;
    let svc;

    beforeEach(async () => {
      transport = createMockTransport();
      svc = createSyncSessionService({
        clientId: "host-1",
        transport,
      });
      await svc.hostSession({ sessionCode: "ABCD-1234" });
    });

    it("devrait revenir à idle après leave", async () => {
      const result = await svc.leaveSession();
      expect(result.left).toBe(true);
      expect(svc.getState().status).toBe("idle");
      expect(svc.getState().sessionCode).toBe("");
    });

    it("devrait appeler transport.leaveRoom", async () => {
      await svc.leaveSession();
      expect(transport.leaveRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionCode: "ABCD-1234",
          clientId: "host-1",
        }),
      );
    });

    it("devrait retourner left: false si pas de room active", async () => {
      await svc.leaveSession(); // quitter une première fois
      const result = await svc.leaveSession(); // deuxième appel
      expect(result.left).toBe(false);
    });
  });

  describe("publishSessionState", () => {
    let transport;
    let svc;

    beforeEach(async () => {
      transport = createMockTransport();
      svc = createSyncSessionService({
        clientId: "host-1",
        transport,
      });
      await svc.hostSession({ sessionCode: "ABCD-1234" });
    });

    it("devrait publier l'état de session si host", async () => {
      const result = await svc.publishSessionState({ isPlaying: true });
      expect(result).toBe(true);
      expect(transport.updateSessionState).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionCode: "ABCD-1234",
          sourceClientId: "host-1",
          payload: expect.objectContaining({ isPlaying: true }),
        }),
      );
    });

    it("devrait mettre à jour sharedSessionState dans l'état local", async () => {
      await svc.publishSessionState({ isPlaying: true });
      const state = svc.getState();
      expect(state.sharedSessionState).toEqual(
        expect.objectContaining({ isPlaying: true }),
      );
      expect(state.sharedSessionStateRevision).toBe(1);
    });

    it("devrait retourner false si pas host", async () => {
      await svc.leaveSession();
      const participantSvc = createSyncSessionService({
        clientId: "joiner-1",
        transport,
      });
      await participantSvc.joinSession({ sessionCode: "ABCD-1234" });
      const result = await participantSvc.publishSessionState({
        isPlaying: true,
      });
      expect(result).toBe(false);
    });
  });

  describe("updateSessionMeta", () => {
    let transport;
    let svc;

    beforeEach(async () => {
      transport = createMockTransport();
      svc = createSyncSessionService({
        clientId: "host-1",
        transport,
      });
      await svc.hostSession({ sessionCode: "ABCD-1234" });
    });

    it("devrait mettre à jour le nom de session", async () => {
      const result = await svc.updateSessionMeta({
        sessionName: "Nouveau Nom",
      });
      expect(result).toBe(true);
      expect(transport.updateRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({ sessionName: "Nouveau Nom" }),
        }),
      );
    });

    it("devrait retourner false si pas host", async () => {
      await svc.leaveSession();
      const result = await svc.updateSessionMeta({ sessionName: "Nope" });
      expect(result).toBe(false);
    });
  });

  describe("session code validation", () => {
    let transport;
    let svc;

    beforeEach(() => {
      transport = createMockTransport();
      svc = createSyncSessionService({ clientId: "c1", transport });
    });

    it("devrait accepter un code valide XXXX-XXXX", async () => {
      await expect(
        svc.hostSession({ sessionCode: "AB12-CD34" }),
      ).resolves.toBeTruthy();
    });

    it("devrait rejeter un code trop court", async () => {
      await expect(
        svc.hostSession({ sessionCode: "AB-CD" }),
      ).rejects.toThrow("invalid-session-code");
    });

    it("devrait rejeter un code avec des caractères spéciaux", async () => {
      await expect(
        svc.hostSession({ sessionCode: "AB!@-CD#$" }),
      ).rejects.toThrow("invalid-session-code");
    });

    it("devrait normaliser en majuscules", async () => {
      await svc.hostSession({ sessionCode: "abcd-1234" });
      expect(svc.getState().sessionCode).toBe("ABCD-1234");
    });
  });

  describe("room events", () => {
    let transport;
    let svc;

    beforeEach(async () => {
      transport = createMockTransport();
      svc = createSyncSessionService({
        clientId: "host-1",
        transport,
      });
      await svc.hostSession({ sessionCode: "ABCD-1234" });
    });

    it("devrait appliquer un snapshot sur room-updated", () => {
      transport._emit("ABCD-1234", {
        type: "room-updated",
        snapshot: {
          sessionCode: "ABCD-1234",
          participantsCount: 3,
          participantIds: ["host-1", "p1", "p2"],
          participantProfiles: { "host-1": "Host", p1: "Alice", p2: "Bob" },
        },
      });
      const state = svc.getState();
      expect(state.participantsCount).toBe(3);
      expect(state.participantIds).toEqual(["host-1", "p1", "p2"]);
    });

    it("devrait mettre à jour le shared state sur session-state-updated", () => {
      transport._emit("ABCD-1234", {
        type: "session-state-updated",
        state: { isPlaying: false, revision: 5 },
      });
      const state = svc.getState();
      expect(state.sharedSessionState).toEqual(
        expect.objectContaining({ isPlaying: false }),
      );
      expect(state.sharedSessionStateRevision).toBe(5);
    });

    it("devrait ignorer un session-state-updated avec révision inférieure", () => {
      transport._emit("ABCD-1234", {
        type: "session-state-updated",
        state: { isPlaying: true, revision: 10 },
      });
      transport._emit("ABCD-1234", {
        type: "session-state-updated",
        state: { isPlaying: false, revision: 5 },
      });
      expect(svc.getState().sharedSessionStateRevision).toBe(10);
      expect(svc.getState().sharedSessionState.isPlaying).toBe(true);
    });

    it("devrait réinitialiser sur room-closed", () => {
      transport._emit("ABCD-1234", {
        type: "room-closed",
        source: "host-left",
      });
      const state = svc.getState();
      expect(state.status).toBe("idle");
      expect(state.lastError).toBe("host-disconnected");
    });

    it("devrait gérer room-closed avec ttl-expired", () => {
      transport._emit("ABCD-1234", {
        type: "room-closed",
        source: "ttl-expired",
      });
      expect(svc.getState().lastError).toBe("session-expired");
    });
  });

  describe("drawing sync", () => {
    let transport;
    let svc;

    beforeEach(async () => {
      transport = createMockTransport();
      svc = createSyncSessionService({
        clientId: "host-1",
        transport,
      });
      await svc.hostSession({ sessionCode: "ABCD-1234" });
    });

    it("devrait envoyer un message drawing sync", async () => {
      const result = await svc.sendDrawingSync("stroke", {
        points: [1, 2, 3],
      });
      expect(result).toBe(true);
      expect(transport.sendDrawingSync).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionCode: "ABCD-1234",
          sourceClientId: "host-1",
          msgType: "stroke",
          data: { points: [1, 2, 3] },
        }),
      );
    });

    it("devrait notifier les listeners de drawing sync", () => {
      const listener = vi.fn();
      svc.onDrawingSync(listener);

      transport._emit("ABCD-1234", {
        type: "drawing-sync",
        sourceClientId: "other-client",
        msgType: "stroke",
        data: { x: 10 },
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "drawing-sync",
          sourceClientId: "other-client",
        }),
      );
    });

    it("devrait ignorer ses propres drawing sync events", () => {
      const listener = vi.fn();
      svc.onDrawingSync(listener);

      transport._emit("ABCD-1234", {
        type: "drawing-sync",
        sourceClientId: "host-1", // même clientId
        msgType: "stroke",
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it("offDrawingSync devrait retirer le listener", () => {
      const listener = vi.fn();
      svc.onDrawingSync(listener);
      svc.offDrawingSync(listener);

      transport._emit("ABCD-1234", {
        type: "drawing-sync",
        sourceClientId: "other",
        msgType: "stroke",
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
