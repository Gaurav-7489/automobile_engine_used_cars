/**
 * Live mode: data comes from the tenant database and nothing is simulated.
 * The server turns it on for every request; the client turns it on from the state it receives.
 * Sample mode (fixtures) exists only for automated tests and local component work.
 */
let live = false;
export const isLive = (): boolean => live;
export function setLive(value: boolean): void {
  live = value;
}
