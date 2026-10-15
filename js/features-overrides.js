import { features as baseFeatures } from "./features.js";

const energyState = (state) => state.features?.energy ?? { value: 5, lowThreshold: 3 };

export const featureOverrides = {
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
