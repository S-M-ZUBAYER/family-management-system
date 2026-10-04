type DashboardFetch = (input: string, init: RequestInit) => Promise<Response>;

export async function fetchDashboardWithRetry(
  request: DashboardFetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await request("/api/dashboard", { cache: "no-store" });
      if (![502, 503, 504].includes(response.status) || attempt === 1) return response;
    } catch (error) {
      if (attempt === 1) throw error;
    }
    await wait(250);
  }
  throw new Error("Dashboard request did not complete.");
}
