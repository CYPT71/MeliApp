import { config } from "../config.js";
import { createAiService } from "./ai.js";
import { createInstallService } from "./install.js";
import { createLocalAiService } from "./local-ai.js";
import { createNotificationService } from "./notifications.js";
import { createOutlookService } from "./outlook.js";
import { createSpotifyService } from "./spotify.js";
import { createIndexedDbStorage } from "./storage.js";

export const createServices = () => ({
  storage: createIndexedDbStorage(),
  notifications: createNotificationService(),
  install: createInstallService(),
  localAi: createLocalAiService(),
  outlook: createOutlookService({
    clientId: config.microsoftClientId,
    tenant: config.microsoftTenant,
    authMode: config.microsoftAuthMode,
    scopes: config.microsoftScopes
  }),
  spotify: createSpotifyService({ clientId: config.spotifyClientId }),
  ai: createAiService()
});
