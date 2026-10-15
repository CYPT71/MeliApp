import { config } from "../config.js";
import { createAiService } from "./ai.js";
import { createInstallService } from "./install.js";
import { createNotificationService } from "./notifications.js";
import { createOutlookService } from "./outlook.js";
import { createSpotifyService } from "./spotify.js";
import { createIndexedDbStorage } from "./storage.js";

export const createServices = () => ({
  storage: createIndexedDbStorage(),
  notifications: createNotificationService(),
  install: createInstallService(),
  outlook: createOutlookService({ clientId: config.microsoftClientId, tenant: config.microsoftTenant }),
  spotify: createSpotifyService({ clientId: config.spotifyClientId }),
  ai: createAiService()
});
