// server.js
// Family-friendly web backend for the Chore Tracker.
// This is intentionally low-stakes: the "face password" is a friendly
// photo-passcode, not biometric-grade security.

const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// --- Middleware -----------------------------------------------------------
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- In-memory "database" -------------------------------------------------

const state = {
  users: {
    // key: {
    //   name,
    //   role: 'parent' | 'child',
    //   balance: number, // total paid out / reconciled
    //   faceProfile: { signature, thumbnail, enrolledAt, threshold }
    // }
  },
  chores: [
    // { id, name, timing, price, emoji, required, active }
  ],
  completions: [
    // {
    //   id,
    //   childKey,
    //   childName,
    //   choreId,
    //   choreName,
    //   chorePrice,
    //   choreEmoji,
    //   choreTiming,
    //   choreRequired,
    //   timestamp,
    //   paidAt,
    //   paymentId
    // }
  ],
  payments: [
    // { id, childKey, childName, amount, timestamp, note }
  ],
  nextChoreId: 1,
  nextCompletionId: 1,
  nextPaymentId: 1,
};

// --- Utility functions ----------------------------------------------------

function normalizeName(name) {
  return String(name || "").trim();
}

function userKey(name) {
  return normalizeName(name).toLowerCase();
}

function getRoleForName(name) {
  const lower = userKey(name);
  if (lower === "aaron" || lower === "janet") {
    return "parent";
  }
  return "child";
}

function ensureUserExists(name) {
  const trimmedName = normalizeName(name);
  const key = userKey(trimmedName);

  if (!trimmedName) {
    throw new Error("Name is required");
  }

  if (!state.users[key]) {
    state.users[key] = {
      name: trimmedName,
      role: getRoleForName(trimmedName),
      balance: 0,
      faceProfile: null,
    };
  }

  // Keep the most recently typed capitalization for display.
  state.users[key].name = trimmedName;
  return state.users[key];
}

function getUserByName(name) {
  return state.users[userKey(name)];
}

function getLastWeekTimestamp() {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return now - sevenDaysMs;
}

function startOfTodayTimestamp() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekTimestamp() {
  // Sunday-start week, which is usually natural for household allowance.
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}

function validateSignature(signature) {
  return (
    Array.isArray(signature) &&
    signature.length >= 64 &&
    signature.length <= 1024 &&
    signature.every((v) => typeof v === "number" && v >= 0 && v <= 1)
  );
}

function compareSignatures(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 1;
  }

  let totalDifference = 0;
  for (let i = 0; i < a.length; i++) {
    totalDifference += Math.abs(a[i] - b[i]);
  }

  return totalDifference / a.length;
}

function publicUser(user) {
  return {
    name: user.name,
    role: user.role,
    balance: user.balance,
    hasFaceProfile: !!user.faceProfile,
  };
}

function completionWindowStartForChore(chore) {
  if (chore.timing === "daily") return startOfTodayTimestamp();
  if (chore.timing === "weekly") return startOfWeekTimestamp();
  return null; // ad-hoc chores are intentionally repeatable.
}

function completionsForChildInWindow(childKey, choreId, since) {
  return state.completions.filter((c) => {
    if (c.childKey !== childKey || c.choreId !== choreId) return false;
    if (since == null) return true;
    return c.timestamp >= since;
  });
}

function choreStatusForChild(chore, childKey) {
  const since = completionWindowStartForChore(chore);
  const matchingCompletions = completionsForChildInWindow(childKey, chore.id, since);
  const completedInWindow = matchingCompletions.length > 0;
  const repeatable = chore.timing === "adhoc";

  return {
    completedInWindow,
    repeatable,
    available: repeatable || !completedInWindow,
    countInWindow: matchingCompletions.length,
  };
}

function unpaidCompletionsForChild(childKey) {
  return state.completions
    .filter((c) => c.childKey === childKey && !c.paidAt)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function summarizeCompletions(completions) {
  const byChore = new Map();

  for (const completion of completions) {
    const key = String(completion.choreId);
    if (!byChore.has(key)) {
      byChore.set(key, {
        choreId: completion.choreId,
        name: completion.choreName,
        timing: completion.choreTiming,
        emoji: completion.choreEmoji,
        required: completion.choreRequired,
        count: 0,
        value: 0,
      });
    }

    const item = byChore.get(key);
    item.count += 1;
    item.value += completion.chorePrice;
  }

  const items = Array.from(byChore.values());
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return { items, total };
}

// --- API routes -----------------------------------------------------------

// Friendly photo login.
// The browser computes a simple visual signature from the camera image.
// If this is the user's first photo, the app enrolls it.
// If a profile exists, the app accepts reasonably fuzzy matches.
app.post("/api/auth/photo", (req, res) => {
  const { name, signature, thumbnail } = req.body;

  const trimmedName = normalizeName(name);
  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }

  if (!validateSignature(signature)) {
    return res.status(400).json({ error: "A valid photo signature is required" });
  }

  const user = ensureUserExists(trimmedName);

  if (!user.faceProfile) {
    user.faceProfile = {
      signature,
      thumbnail: typeof thumbnail === "string" ? thumbnail : null,
      enrolledAt: Date.now(),
      threshold: 0.35,
    };

    return res.status(201).json({
      ...publicUser(user),
      authenticated: true,
      enrolled: true,
      message: `Hi ${user.name}! I saved this as your family photo passcode.`,
    });
  }

  const score = compareSignatures(signature, user.faceProfile.signature);
  const threshold = user.faceProfile.threshold ?? 0.35;
  const authenticated = score <= threshold;

  if (!authenticated) {
    return res.status(401).json({
      error: "That photo did not look close enough. Try again with your face centered in the frame.",
      authenticated: false,
      score,
      threshold,
    });
  }

  res.json({
    ...publicUser(user),
    authenticated: true,
    enrolled: false,
    score,
    threshold,
    message: `Welcome back, ${user.name}.`,
  });
});

// Backward-compatible name-only login for local development / camera failures.
// The UI uses /api/auth/photo by default.
app.post("/api/login", (req, res) => {
  const { name } = req.body;
  const trimmedName = normalizeName(name);

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }

  const user = ensureUserExists(trimmedName);
  res.json({
    ...publicUser(user),
    authenticated: true,
    enrolled: !!user.faceProfile,
    authMethod: "name-only",
  });
});

// Get all active chores
app.get("/api/chores", (req, res) => {
  res.json(state.chores.filter((chore) => chore.active !== false));
});

// Create a new chore (parent UI)
app.post("/api/chores", (req, res) => {
  const { name, timing, price, emoji, required } = req.body;

  if (!name || !timing || price == null) {
    return res.status(400).json({ error: "name, timing and price are required" });
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
    name: String(name).trim(),
    timing,
    price: numericPrice,
    emoji: emoji || "⭐",
    required: !!required,
    active: true,
  };

  state.chores.push(chore);
  res.status(201).json(chore);
});

// Edit an existing chore (parent UI)
app.put("/api/chores/:id", (req, res) => {
  const chore = state.chores.find((c) => c.id === Number(req.params.id));
  if (!chore) {
    return res.status(404).json({ error: "Chore not found" });
  }

  const { name, timing, price, emoji, required, active } = req.body;
  const validTimings = ["daily", "adhoc", "weekly"];

  if (name != null && String(name).trim()) {
    chore.name = String(name).trim();
  }

  if (timing != null) {
    if (!validTimings.includes(timing)) {
      return res.status(400).json({ error: "Invalid timing value" });
    }
    chore.timing = timing;
  }

  if (price != null) {
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: "Invalid price" });
    }
    chore.price = numericPrice;
  }

  if (emoji != null) {
    chore.emoji = String(emoji).trim() || "⭐";
  }

  if (required != null) {
    chore.required = !!required;
  }

  if (active != null) {
    chore.active = !!active;
  }

  res.json(chore);
});

// Parent: chore report for the last week
app.get("/api/report", (req, res) => {
  const since = getLastWeekTimestamp();

  const children = Object.entries(state.users).filter(([, user]) => user.role === "child");

  const report = children.map(([key, user]) => {
    const completions = state.completions.filter(
      (c) => c.childKey === key && c.timestamp >= since
    );
    const { items, total } = summarizeCompletions(completions);
    const unpaid = unpaidCompletionsForChild(key).reduce(
      (sum, completion) => sum + completion.chorePrice,
      0
    );

    return {
      childName: user.name,
      total,
      unpaid,
      items,
    };
  });

  res.json(report);
});

// Parent: reconcile summary (how much each child has earned but has not been paid)
app.get("/api/reconcile-summary", (req, res) => {
  const children = Object.entries(state.users).filter(([, user]) => user.role === "child");

  const summary = children.map(([key, user]) => {
    const unpaidCompletions = unpaidCompletionsForChild(key);
    const earned = unpaidCompletions.reduce(
      (sum, completion) => sum + completion.chorePrice,
      0
    );

    return {
      childName: user.name,
      earned,
      currentBalance: user.balance,
      unpaidCompletionCount: unpaidCompletions.length,
    };
  });

  res.json(summary);
});

// Parent: reconcile / note a payment paid out
app.post("/api/reconcile", (req, res) => {
  const { childName, amount, note } = req.body;
  if (!childName) {
    return res.status(400).json({ error: "childName is required" });
  }

  const key = userKey(childName);
  const user = state.users[key];
  if (!user || user.role !== "child") {
    return res.status(404).json({ error: "Child not found" });
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const payment = {
    id: state.nextPaymentId++,
    childKey: key,
    childName: user.name,
    amount: numericAmount,
    timestamp: Date.now(),
    note: note || "Allowance paid",
  };

  state.payments.push(payment);
  user.balance += numericAmount;

  // Mark whole unpaid chore completions as paid, oldest first, up to the payment amount.
  let remaining = numericAmount + 0.00001;
  for (const completion of unpaidCompletionsForChild(key)) {
    if (completion.chorePrice <= remaining) {
      completion.paidAt = payment.timestamp;
      completion.paymentId = payment.id;
      remaining -= completion.chorePrice;
    }
  }

  res.json({
    childName: user.name,
    amount: numericAmount,
    newBalance: user.balance,
    payment,
    unpaidRemaining: unpaidCompletionsForChild(key).reduce(
      (sum, completion) => sum + completion.chorePrice,
      0
    ),
  });
});

// Parent: payment history
app.get("/api/payments", (req, res) => {
  res.json(
    [...state.payments].sort((a, b) => b.timestamp - a.timestamp)
  );
});

// Child: today's available chore menu
app.get("/api/child/:name/today", (req, res) => {
  const name = req.params.name;
  const user = getUserByName(name);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.role !== "child") {
    return res.status(400).json({ error: "This view is for child users" });
  }

  const key = userKey(name);
  const today = startOfTodayTimestamp();
  const week = startOfWeekTimestamp();

  const todaysCompletions = state.completions.filter(
    (c) => c.childKey === key && c.timestamp >= today
  );
  const weeklyCompletions = state.completions.filter(
    (c) => c.childKey === key && c.timestamp >= week
  );
  const unpaidCompletions = unpaidCompletionsForChild(key);

  const chores = state.chores
    .filter((chore) => chore.active !== false)
    .map((chore) => {
      const status = choreStatusForChild(chore, key);
      return {
        ...chore,
        ...status,
      };
    });

  const availableChores = chores.filter((chore) => chore.available);

  res.json({
    childName: user.name,
    balance: user.balance,
    todayTotal: todaysCompletions.reduce((sum, c) => sum + c.chorePrice, 0),
    weekTotal: weeklyCompletions.reduce((sum, c) => sum + c.chorePrice, 0),
    unpaidTotal: unpaidCompletions.reduce((sum, c) => sum + c.chorePrice, 0),
    chores,
    availableChores,
  });
});

// Child: aggregated completions in last week
app.get("/api/child/:name/completions", (req, res) => {
  const name = req.params.name;
  const user = getUserByName(name);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const key = userKey(name);
  const since = getLastWeekTimestamp();

  const completions = state.completions.filter(
    (c) => c.childKey === key && c.timestamp >= since
  );

  const { items, total } = summarizeCompletions(completions);

  res.json({
    childName: user.name,
    items,
    total,
    unpaidTotal: unpaidCompletionsForChild(key).reduce(
      (sum, completion) => sum + completion.chorePrice,
      0
    ),
    balance: user.balance,
  });
});

// Child: complete a chore
app.post("/api/child/:name/complete", (req, res) => {
  const name = req.params.name;
  const { choreId } = req.body;

  const user = getUserByName(name);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.role !== "child") {
    return res.status(400).json({ error: "Only child users can complete chores" });
  }

  const chore = state.chores.find((c) => c.id === Number(choreId) && c.active !== false);
  if (!chore) {
    return res.status(404).json({ error: "Chore not found" });
  }

  const key = userKey(name);
  const status = choreStatusForChild(chore, key);
  if (!status.available) {
    return res.status(409).json({
      error: `That ${chore.timing} chore has already been recorded for this period.`,
    });
  }

  const completion = {
    id: state.nextCompletionId++,
    childKey: key,
    childName: user.name,
    choreId: chore.id,
    choreName: chore.name,
    chorePrice: chore.price,
    choreEmoji: chore.emoji,
    choreTiming: chore.timing,
    choreRequired: chore.required,
    timestamp: Date.now(),
    paidAt: null,
    paymentId: null,
  };

  state.completions.push(completion);

  res.status(201).json({
    message: "Chore completion recorded",
    chore,
    completion,
  });
});

// --- Start server --------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Chore Tracker running at http://localhost:${PORT}`);
});
