import { sleep } from "k6";
import { getJson, rampingStages, settings } from "./common.js";

const targets = (__ENV.LEADERBOARD_TARGETS || "20,50,100")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

const rampDuration = __ENV.RAMP_DURATION || "1m";
const holdDuration = __ENV.HOLD_DURATION || "2m";

export const options = {
  stages: [...rampingStages(targets, rampDuration, holdDuration), { duration: "30s", target: 0 }],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{endpoint:leaderboard}": ["p(95)<750", "p(99)<1500"],
  },
};

export default function () {
  getJson(`/api/leaderboard/${settings.competitionId}`, "leaderboard");
  sleep(settings.leaderboardSleepSeconds);
}
