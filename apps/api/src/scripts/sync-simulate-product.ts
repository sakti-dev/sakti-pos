import { simulateProductChange } from "../lib/sync-simulator";

const result = await simulateProductChange();

console.log(JSON.stringify(result, null, 2));
