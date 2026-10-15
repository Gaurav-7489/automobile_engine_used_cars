export async function dealerAction(action: string, payload: unknown) {
  const response = await fetch(`/command/api/dealer/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result.data;
}
