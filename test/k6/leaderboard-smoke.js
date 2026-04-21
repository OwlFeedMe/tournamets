import { sleep } from "k6";
import { getJson, settings } from "./common.js";

export const options = {
  stages: [
    { duration: "1m", target: 20 },
    { duration: "2m", target: 20 },
    { duration: "1m", target: 50 },
    { duration: "2m", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "2m", target: 100 },
    { duration: "30s", target: 0 },
  ],
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
