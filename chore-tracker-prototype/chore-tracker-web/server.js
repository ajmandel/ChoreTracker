// server.js
// Simple web UI backend for the Chore Tracker

const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// --- Middleware -----------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- In-memory "database" -------------------------------------------------

const state = {
  users: {
    // name: { role: 'parent' | 'child', balance: number }
  },
  chores: [
    // { id, name, timing, price, emoji, required }
  ],
  completions: [
    // { childName, choreId, timestamp }
  ],
  nextChoreId: 1,
};

// --- Utility functions ----------------------------------------------------

function getRoleForName(name) {
  const lower = name.toLowerCase();
  if (lower === "aaron" || lower === "janet") {
    return "parent";
  }
  return "child";
}

function ensureUserExists(name) {
  if (!state.users[name]) {
    state.users[name] = { role: getRoleForName(name), balance: 0 };
  }
  return state.users[name];
}

function getLastWeekTimestamp() {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return now - sevenDaysMs;
}

function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}

// --- API routes -----------------------------------------------------------

// Login
app.post("/api/login", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  const trimmedName = name.trim();
  const user = ensureUserExists(trimmedName);
  res.json({
    name: trimmedName,
    role: user.role,
    balance: user.balance,
  });
});

// Get all chores
app.get("/api/chores", (req, res) => {
  res.json(state.chores);
});

// Create a new chore (parent)
app.post("/api/chores", (req, res) => {
  const { name, timing, price, emoji, required } = req.body;

  if (!name || !timing || price == null) {
    return res
      .status(400)
      .json({ error: "name, timing and price are required" });
  }

  const validTimings = ["daily", "adhoc", "weekly"];
  if (!validTimings.includes(timing)) {
    return res.status(400).json({ error: "Invalid timing value" });
  }

  const numericPrice = Number(price);
  if (Number.isNaN(numericPrice) || numericPrice < 0) {
    return res.status(400).json({ error: "Invalid price" });
  }

  const chore = {
    id: state.nextChoreId++,
    name,
    timing,
    price: numericPrice,
    emoji: emoji || "⭐",
    required: !!required,
  };

  state.chores.push(chore);
  res.status(201).json(chore);
});

// Parent: chore report for the last week
app.get("/api/report", (req, res) => {
  const since = getLastWeekTimestamp();

  const children = Object.entries(state.users).filter(
    ([, user]) => user.role === "child"
  );

  const report = children.map(([childName]) => {
    const items = [];
    let total = 0;

    for (const chore of state.chores) {
      const count = state.completions.filter(
        (c) =>
          c.childName === childName &&
          c.choreId === chore.id &&
          c.timestamp >= since
      ).length;

      if (count > 0) {
        const value = count * chore.price;
        total += value;
        items.push({
          choreId: chore.id,
          name: chore.name,
          timing: chore.timing,
          emoji: chore.emoji,
          required: chore.required,
          count,
          value,
        });
      }
    }

    return {
      childName,
      total,
      items,
    };
  });

  res.json(report);
});

// Parent: reconcile summary (how much each child earned last week)
app.get("/api/reconcile-summary", (req, res) => {
  const since = getLastWeekTimestamp();

  const children = Object.entries(state.users).filter(
    ([, user]) => user.role === "child"
  );

  const summary = children.map(([childName, user]) => {
    let earned = 0;
    for (const chore of state.chores) {
      const count = state.completions.filter(
        (c) =>
          c.childName === childName &&
          c.choreId === chore.id &&
          c.timestamp >= since
      ).length;
      earned += count * chore.price;
    }
    return {
      childName,
      earned,
      currentBalance: user.balance,
    };
  });

  res.json(summary);
});

// Parent: reconcile (transfer money to child)
app.post("/api/reconcile", (req, res) => {
  const { childName, amount } = req.body;
  if (!childName) {
    return res.status(400).json({ error: "childName is required" });
  }

  const user = state.users[childName];
  if (!user || user.role !== "child") {
    return res.status(404).json({ error: "Child not found" });
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  user.balance += numericAmount;
  res.json({
    childName,
    amount: numericAmount,
    newBalance: user.balance,
  });
});

// Child: aggregated completions in last week
app.get("/api/child/:name/completions", (req, res) => {
  const name = req.params.name;
  const user = state.users[name];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const since = getLastWeekTimestamp();

  const completions = state.completions.filter(
    (c) => c.childName === name && c.timestamp >= since
  );

  const byChore = {};
  for (const c of completions) {
    byChore[c.choreId] = (byChore[c.choreId] || 0) + 1;
  }

  const items = [];
  let total = 0;

  for (const chore of state.chores) {
    const count = byChore[chore.id] || 0;
    if (count > 0) {
      const value = count * chore.price;
      total += value;
      items.push({
        choreId: chore.id,
        name: chore.name,
        timing: chore.timing,
        emoji: chore.emoji,
        required: chore.required,
        count,
        value,
      });
    }
  }

  res.json({
    childName: name,
    items,
    total,
    balance: user.balance,
  });
});

// Child: complete a chore
app.post("/api/child/:name/complete", (req, res) => {
  const name = req.params.name;
  const { choreId } = req.body;

  const user = state.users[name];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const chore = state.chores.find((c) => c.id === Number(choreId));
  if (!chore) {
    return res.status(404).json({ error: "Chore not found" });
  }

  state.completions.push({
    childName: name,
    choreId: chore.id,
    timestamp: Date.now(),
  });

  res.status(201).json({
    message: "Chore completion recorded",
    chore,
  });
});

// --- Start server --------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Chore Tracker running at http://localhost:${PORT}`);
});
