import { sleep } from "k6";
import { getJson, settings } from "./common.js";

const includeTimer = __ENV.INCLUDE_TIMER === "1";

const scenarios = {
  leaderboard_viewers: {
    executor: "ramping-vus",
    exec: "leaderboardScenario",
    stages: [
      { duration: "1m", target: 20 },
      { duration: "2m", target: 20 },
      { duration: "1m", target: 50 },
      { duration: "2m", target: 50 },
      { duration: "1m", target: 100 },
      { duration: "2m", target: 100 },
      { duration: "30s", target: 0 },
    ],
    gracefulRampDown: "15s",
  },
  public_page_viewers: {
    executor: "ramping-vus",
    exec: "publicScenario",
    stages: [
      { duration: "1m", target: 5 },
      { duration: "2m", target: 5 },
      { duration: "1m", target: 10 },
      { duration: "2m", target: 10 },
      { duration: "1m", target: 20 },
      { duration: "2m", target: 20 },
      { duration: "30s", target: 0 },
    ],
    gracefulRampDown: "15s",
  },
};

if (includeTimer) {
  scenarios.timer_viewers = {
    executor: "ramping-vus",
    exec: "timerScenario",
    stages: [
      { duration: "1m", target: 5 },
      { duration: "2m", target: 5 },
      { duration: "1m", target: 10 },
      { duration: "2m", target: 10 },
      { duration: "1m", target: 15 },
      { duration: "2m", target: 15 },
      { duration: "30s", target: 0 },
    ],
    gracefulRampDown: "15s",
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{endpoint:leaderboard}": ["p(95)<750", "p(99)<1500"],
    "http_req_duration{endpoint:competition_public}": ["p(95)<1000", "p(99)<2000"],
    "http_req_duration{endpoint:timer}": ["p(95)<400", "p(99)<1000"],
  },
};

export function leaderboardScenario() {
  getJson(`/api/leaderboard/${settings.competitionId}`, "leaderboard");
  sleep(settings.leaderboardSleepSeconds);
}

export function publicScenario() {
  getJson(`/api/competitions/${settings.competitionId}/public`, "competition_public");
  sleep(settings.publicSleepSeconds);
}

export function timerScenario() {
  getJson(`/api/competitions/${settings.competitionId}/timer`, "timer");
  sleep(settings.timerSleepSeconds);
}
