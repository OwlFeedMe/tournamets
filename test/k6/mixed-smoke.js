import { sleep } from "k6";
import { getJson, rampingStages, settings } from "./common.js";

const includeTimer = __ENV.INCLUDE_TIMER === "1";
const leaderboardTargets = (__ENV.LEADERBOARD_TARGETS || "20,50,100")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const publicTargets = (__ENV.PUBLIC_TARGETS || "5,10,20")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const timerTargets = (__ENV.TIMER_TARGETS || "5,10,15")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const rampDuration = __ENV.RAMP_DURATION || "1m";
const holdDuration = __ENV.HOLD_DURATION || "2m";

const scenarios = {
  leaderboard_viewers: {
    executor: "ramping-vus",
    exec: "leaderboardScenario",
    stages: [...rampingStages(leaderboardTargets, rampDuration, holdDuration), { duration: "30s", target: 0 }],
    gracefulRampDown: "15s",
  },
  public_page_viewers: {
    executor: "ramping-vus",
    exec: "publicScenario",
    stages: [...rampingStages(publicTargets, rampDuration, holdDuration), { duration: "30s", target: 0 }],
    gracefulRampDown: "15s",
  },
};

if (includeTimer) {
  scenarios.timer_viewers = {
    executor: "ramping-vus",
    exec: "timerScenario",
    stages: [...rampingStages(timerTargets, rampDuration, holdDuration), { duration: "30s", target: 0 }],
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
