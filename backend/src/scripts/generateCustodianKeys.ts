import { generateAndSaveCustodianKeys } from "../utils/keyWrapping.js";

generateAndSaveCustodianKeys()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
