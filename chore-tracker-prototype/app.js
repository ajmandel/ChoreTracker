// app.js
// Simple Node CLI prototype for your chore tracker

const readline = require("readline");

// --- CLI helpers ----------------------------------------------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

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

// --- Core flows ----------------------------------------------------------

// Parent: create a new chore
async function createNewChore() {
  console.log("\n🧹 Create a new chore");

  const name = await ask("Chore name: ");
  let timing = "";
  while (!["1", "2", "3"].includes(timing)) {
    console.log("Timing options:");
    console.log("  1) Daily");
    console.log("  2) Ad-hoc");
    console.log("  3) Weekly");
    timing = await ask("Choose timing (1/2/3): ");
  }

  const timingMap = { "1": "daily", "2": "adhoc", "3": "weekly" };
  timing = timingMap[timing];

  let price = NaN;
  while (Number.isNaN(price)) {
    const p = await ask("Price for performing this chore (e.g. 1.50): ");
    price = Number(p);
    if (Number.isNaN(price)) {
      console.log("Please enter a valid number.");
    }
  }

  const emoji = await ask("Emoji for this chore (e.g. 🧼): ");

  let requiredAns = "";
  while (!["y", "n"].includes(requiredAns)) {
    requiredAns = (await ask("Is this chore required to qualify for allowance? (y/n): ")).toLowerCase();
  }
  const required = requiredAns === "y";

  const chore = {
    id: state.nextChoreId++,
    name,
    timing,
    price,
    emoji: emoji || "⭐",
    required,
  };

  state.chores.push(chore);

  console.log("\n✅ New chore created:");
  console.log(chore);
}

// Parent: view chore report (last week)
async function viewChoreReport() {
  console.log("\n📊 Chore report for the last 7 days\n");

  const since = getLastWeekTimestamp();

  // Get all children
  const children = Object.entries(state.users).filter(
    ([, user]) => user.role === "child"
  );

  if (children.length === 0) {
    console.log("No children have logged in yet.\n");
    return;
  }

  for (const [childName] of children) {
    console.log(`Child: ${childName}`);
    let childTotal = 0;

    for (const chore of state.chores) {
      const count = state.completions.filter(
        (c) =>
          c.childName === childName &&
          c.choreId === chore.id &&
          c.timestamp >= since
      ).length;

      if (count > 0) {
        const value = count * chore.price;
        childTotal += value;
        console.log(
          `  - ${chore.emoji} ${chore.name} (${chore.timing}) x ${count} = ${formatMoney(
            value
          )}`
        );
      }
    }

    if (childTotal === 0) {
      console.log("  (no chores completed in the last week)");
    } else {
      console.log(`  ▶ Total value: ${formatMoney(childTotal)}`);
    }
    console.log("");
  }
}

// Parent: reconcile report (pay children)
async function reconcileReport() {
  console.log("\n💸 Reconcile allowance");

  const since = getLastWeekTimestamp();
  const children = Object.entries(state.users).filter(
    ([, user]) => user.role === "child"
  );

  if (children.length === 0) {
    console.log("No children to reconcile.\n");
    return;
  }

  // Build summary for each child
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
    return { childName, balance: user.balance, earned };
  });

  console.log("Children summary (last 7 days):");
  summary.forEach((s, idx) => {
    console.log(
      `  ${idx + 1}) ${s.childName} - earned: ${formatMoney(
        s.earned
      )}, current balance: ${formatMoney(s.balance)}`
    );
  });

  const choice = await ask(
    "\nSelect a child to transfer allowance to (or press Enter to go back): "
  );
  if (!choice) {
    return;
  }

  const index = Number(choice) - 1;
  if (index < 0 || index >= summary.length) {
    console.log("Invalid choice.\n");
    return;
  }

  const target = summary[index];

  if (target.earned === 0) {
    console.log(
      `${target.childName} has no earned chores in the last week. You can still manually add money if you want.`
    );
  }

  const defaultAmountStr = target.earned.toFixed(2);
  const amountStr = await ask(
    `Amount to transfer to ${target.childName} (default ${defaultAmountStr}): `
  );
  const amount = amountStr ? Number(amountStr) : target.earned;

  if (Number.isNaN(amount) || amount <= 0) {
    console.log("No valid transfer made.\n");
    return;
  }

  state.users[target.childName].balance += amount;
  console.log(
    `✅ Transferred ${formatMoney(
      amount
    )} to ${target.childName}. New balance: ${formatMoney(
      state.users[target.childName].balance
    )}\n`
  );

  // NOTE: In a real app we'd mark these completions as "paid" so we don't pay twice.
}

// Child: view my completed chores
async function childViewCompletedChores(childName) {
  console.log(`\n📋 Chores completed by ${childName} in the last 7 days:\n`);

  const since = getLastWeekTimestamp();
  const myCompletions = state.completions.filter(
    (c) => c.childName === childName && c.timestamp >= since
  );

  if (myCompletions.length === 0) {
    console.log("You haven't completed any chores in the last week yet.\n");
    return;
  }

  let total = 0;
  for (const chore of state.chores) {
    const count = myCompletions.filter((c) => c.choreId === chore.id).length;
    if (count > 0) {
      const value = count * chore.price;
      total += value;
      console.log(
        `  - ${chore.emoji} ${chore.name} (${chore.timing}) x ${count} = ${formatMoney(
          value
        )}`
      );
    }
  }

  console.log(`\n▶ Total potential value this week: ${formatMoney(total)}\n`);
  console.log(
    `Note: This is *potential* – the parent still needs to reconcile to move it to your balance.\n`
  );
}

// Child: complete a chore
async function childCompleteChore(childName) {
  console.log("\n✅ Complete a chore");

  if (state.chores.length === 0) {
    console.log("There are no chores available yet. Ask a parent to add some.\n");
    return;
  }

  console.log("Available chores:");
  state.chores.forEach((chore, idx) => {
    console.log(
      `  ${idx + 1}) ${chore.emoji} ${chore.name} [${chore.timing}] - ${formatMoney(
        chore.price
      )}${chore.required ? " (required)" : ""}`
    );
  });

  const choice = await ask(
    "\nWhich chore did you complete? (number or Enter to cancel): "
  );
  if (!choice) {
    return;
  }

  const index = Number(choice) - 1;
  if (index < 0 || index >= state.chores.length) {
    console.log("Invalid choice.\n");
    return;
  }

  const chore = state.chores[index];
  state.completions.push({
    childName,
    choreId: chore.id,
    timestamp: Date.now(),
  });

  console.log(
    `🎉 Nice work, ${childName}! Recorded completion of: ${chore.emoji} ${chore.name}\n`
  );
}

// --- Menus ---------------------------------------------------------------

async function parentMenu(parentName) {
  let exit = false;
  while (!exit) {
    console.log(`\n👩‍👧 Parent menu (${parentName})`);
    console.log("  1) Set up a new chore");
    console.log("  2) View chore report");
    console.log("  3) Reconcile allowance");
    console.log("  4) Switch user");
    console.log("  5) Exit");

    const choice = await ask("Choose an option: ");

    switch (choice) {
      case "1":
        await createNewChore();
        break;
      case "2":
        await viewChoreReport();
        break;
      case "3":
        await reconcileReport();
        break;
      case "4":
        exit = true; // back to login
        break;
      case "5":
        console.log("Goodbye!");
        rl.close();
        process.exit(0);
      default:
        console.log("Please choose a valid option.");
    }
  }
}

async function childMenu(childName) {
  let exit = false;
  while (!exit) {
    const user = state.users[childName];
    console.log(`\n🧒 Child menu (${childName})`);
    console.log(`  Your balance: ${formatMoney(user.balance)}`);
    console.log("  1) View my completed chores");
    console.log("  2) Complete a chore");
    console.log("  3) Switch user");
    console.log("  4) Exit");

    const choice = await ask("Choose an option: ");

    switch (choice) {
      case "1":
        await childViewCompletedChores(childName);
        break;
      case "2":
        await childCompleteChore(childName);
        break;
      case "3":
        exit = true; // back to login
        break;
      case "4":
        console.log("Goodbye!");
        rl.close();
        process.exit(0);
      default:
        console.log("Please choose a valid option.");
    }
  }
}

// --- Main loop -----------------------------------------------------------

async function main() {
  console.log("🧼 Welcome to the Chore Tracker prototype (Node CLI)\n");

  while (true) {
    const name = await ask("What is your name? (or type 'exit' to quit): ");
    if (!name || name.toLowerCase() === "exit") {
      console.log("Goodbye!");
      rl.close();
      process.exit(0);
    }

    const role = getRoleForName(name);
    const user = ensureUserExists(name);

    console.log(
      `\nHello, ${name}! You are logged in as a ${role.toUpperCase()}.\n`
    );

    if (role === "parent") {
      await parentMenu(name);
    } else {
      await childMenu(name);
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  rl.close();
  process.exit(1);
});
