import { features as baseFeatures } from "./features.js";

const energyState = (state) => state.features?.energy ?? { value: 5, lowThreshold: 3 };

export const featureOverrides = {
  microsoftAuth: {
    ...baseFeatures.microsoftAuth,
    description: "Calendrier Outlook",
    page: { path: "outlook", title: "Calendrier Outlook", icon: "📅", order: 10 },
    ui: {
      ...baseFeatures.microsoftAuth.ui,
      render: ({ state }) => {
        const current = state.features?.microsoftAuth ?? {};
        const connected = current.status === "connected" || Boolean(state.auth?.microsoft?.connected);
        const root = document.createElement("div");
        root.className = "stack";

        const text = document.createElement("p");
        text.textContent = connected
          ? "Le calendrier Outlook est connecté. MeliApp utilise ses événements pour connaître tes contraintes et tes créneaux libres."
          : "Connecte ton calendrier Outlook pour importer tes événements et construire le planning autour de tes vrais créneaux.";
        root.append(text);

        if (current.error) {
          const error = document.createElement("p");
          error.className = "error";
          error.textContent = current.error;
          root.append(error);
        }

        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = connected ? "microsoft.logout" : "microsoft.login";
        button.className = connected ? "" : "primary";
        button.textContent = connected ? "Déconnecter le calendrier Outlook" : "Connecter le calendrier Outlook";
        root.append(button);

        return root;
      }
    }
  },

  spotify: {
    ...baseFeatures.spotify,
    run: async (context) => {
      if (context.event === "energy:set") {
        const energy = Number(context.payload?.value ?? energyState(context.state).value ?? 5);
        const threshold = Number(energyState(context.state).lowThreshold ?? 3);
        if (energy > threshold) return context.state;
      }
      return baseFeatures.spotify.run(context);
    }
  }
};
