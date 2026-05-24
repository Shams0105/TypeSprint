import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { ResultRecord, StatsSummary } from "./src/types";

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "results.json");

// Core seed score list to make the app visual-perfect and instantly populated
const SEED_RECORDS: ResultRecord[] = [
  {
    id: "seed-1",
    username: "JsonDerulo",
    wpm: 142,
    accuracy: 99.8,
    time: 12.4,
    streak: 15,
    peakWpm: 150,
    sessionFlow: [110, 120, 125, 135, 142, 140, 145, 150],
    date: new Date(Date.now() - 3600000 * 2).toISOString(),
    mode: "race"
  },
  {
    id: "seed-2",
    username: "KeySmash",
    wpm: 138,
    accuracy: 98.2,
    time: 15.1,
    streak: 8,
    peakWpm: 144,
    sessionFlow: [100, 115, 120, 128, 138, 130, 135, 144],
    date: new Date(Date.now() - 3600000 * 5).toISOString(),
    mode: "race"
  },
  {
    id: "seed-3",
    username: "FastTyper",
    wpm: 135,
    accuracy: 97.5,
    time: 14.8,
    streak: 22,
    peakWpm: 140,
    sessionFlow: [95, 110, 120, 130, 135, 128, 132, 140],
    date: new Date(Date.now() - 3600000 * 12).toISOString(),
    mode: "race"
  },
  {
    id: "seed-4",
    username: "SpaceBarKing",
    wpm: 112,
    accuracy: 100.0,
    time: 5.432,
    streak: 12,
    peakWpm: 124,
    sessionFlow: [80, 95, 90, 105, 112, 110, 124, 112],
    date: new Date(Date.now() - 3600000 * 20).toISOString(),
    mode: "race"
  }
];

// Load records from DB file, or use seeds
function loadRecords(): ResultRecord[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content) as ResultRecord[];
    }
  } catch (err) {
    console.error("Error loading db file, falling back to seed records", err);
  }
  
  // Write seed records
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(SEED_RECORDS, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing seed db file", err);
  }
  return SEED_RECORDS;
}

// Save records helper
function saveRecords(records: ResultRecord[]) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing to db file", err);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Check Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV });
  });

  // GET: Fetch all typing speed results
  app.get("/api/results", (req, res) => {
    const records = loadRecords();
    // Sort primarily by WPM (descending), then by accuracy (descending)
    const sorted = [...records].sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy);
    res.json(sorted);
  });

  // POST: Save a completed typing session result
  app.post("/api/results", (req, res) => {
    const { username, wpm, accuracy, time, streak, peakWpm, sessionFlow, mode } = req.body;

    if (!username || typeof wpm !== "number" || typeof accuracy !== "number") {
      res.status(400).json({ error: "Invalid data. Name, speed, and accuracy are required." });
      return;
    }

    const records = loadRecords();
    const newRecord: ResultRecord = {
      id: "res_" + Math.random().toString(36).substr(2, 9),
      username,
      wpm: Math.round(wpm),
      accuracy: parseFloat(accuracy.toFixed(1)),
      time: parseFloat(time.toFixed(3)),
      streak: streak || 0,
      peakWpm: Math.round(peakWpm || wpm),
      sessionFlow: sessionFlow || [Math.round(wpm)],
      date: new Date().toISOString(),
      mode: mode || "race"
    };

    records.push(newRecord);
    saveRecords(records);
    res.status(201).json(newRecord);
  });

  // GET: Retrieve user-specific stats summary
  app.get("/api/stats", (req, res) => {
    const { username } = req.query;
    const searchUsername = (username as string) || "AHETESHAM";

    const records = loadRecords();
    const playerRecords = records.filter(
      r => r.username.toLowerCase() === searchUsername.toLowerCase()
    );

    // Calculate leaderboard positions based on overall rankings
    const sortedLeaderboard = [...records].sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy);
    
    // Find highest ranking index of this player (1-indexed)
    let globalRank = sortedLeaderboard.findIndex(
      r => r.username.toLowerCase() === searchUsername.toLowerCase()
    );
    if (globalRank === -1) {
      globalRank = sortedLeaderboard.length + 1; // placeholder rank
    } else {
      globalRank += 1;
    }

    let peakWpm = 0;
    let avgAccuracy = 0;
    let dayStreak = 0;

    if (playerRecords.length > 0) {
      peakWpm = Math.max(...playerRecords.map(r => r.wpm));
      const totalAccuracy = playerRecords.reduce((sum, r) => sum + r.accuracy, 0);
      avgAccuracy = parseFloat((totalAccuracy / playerRecords.length).toFixed(1));
      dayStreak = Math.max(...playerRecords.map(r => r.streak));
    } else {
      // Fallbacks if user hasn't typed anything yet (matching initial dashboard state)
      peakWpm = 0;
      avgAccuracy = 0;
      dayStreak = 0;
    }

    const summary: StatsSummary = {
      globalRank,
      peakWpm,
      avgAccuracy,
      dayStreak,
      totalSessions: playerRecords.length
    };

    res.json(summary);
  });

  // Vite middleware integration for dynamic HMR development, else serve static assets inside Cloud Run
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TypeSprint Express Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer().catch(err => {
  console.error("Critical server bootstrap error:", err);
});
