import http from "k6/http";
import { check } from "k6";

const baseUrl = (__ENV.BASE_URL || "").replace(/\/+$/, "");
const competitionId = __ENV.COMPETITION_ID || "";

if (!baseUrl) {
  throw new Error("Missing BASE_URL env var");
}

if (!competitionId) {
  throw new Error("Missing COMPETITION_ID env var");
}

export const settings = {
  baseUrl,
  competitionId,
  leaderboardSleepSeconds: Number(__ENV.LEADERBOARD_SLEEP_SECONDS || 5),
  publicSleepSeconds: Number(__ENV.PUBLIC_SLEEP_SECONDS || 20),
  timerSleepSeconds: Number(__ENV.TIMER_SLEEP_SECONDS || 30),
};

export function getJson(path, endpointTag) {
  const response = http.get(`${settings.baseUrl}${path}`, {
    tags: { endpoint: endpointTag },
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    timeout: __ENV.REQUEST_TIMEOUT || "10s",
  });

  check(response, {
    [`${endpointTag} status is 200`]: (res) => res.status === 200,
    [`${endpointTag} body is not empty`]: (res) => Boolean(res.body),
  });

  return response;
}
