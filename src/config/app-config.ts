import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Designaciones arbitrales",
  version: packageJson.version,
  copyright: `© ${currentYear}, Designaciones arbitrales.`,
  meta: {
    title: "Designaciones arbitrales",
  },
};
