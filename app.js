"use strict";

const $ = (id) => document.getElementById(id);

const MAX_PLAYERS = 10;
const DEFAULT_PLAYERS = 5;
const LIMIT = 100000;

const players = [];
const savedRounds = [];

let nextPlayerId = 1;
let selectedRoundNumber = null;
let parkedDraft = null;

let draft = {
  number: 1,
  sessionName: "",
  winnerId: null,
  rules: null,
  entries: []
};

class InputError extends Error {}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

function showScreen(id, headingId) {
  [
    "home-screen",
    "rules-screen",
    "players-screen",
    "round-screen",
    "results-screen"
  ].forEach((screenId) => {
    $(screenId).hidden = screenId !== id;
  });

  // Home does not replace the session's resume destination.
  if (id !== "home-screen") {
    resumeScreen = id;
  }

  if (!restoringSession) {
    saveActiveSession();
  }

  $(headingId).focus();
  window.scrollTo(0, 0);
}

  

function runSafely(messageId, action) {
  $(messageId).textContent = "";

  try {
    action();
  } catch (error) {
    if (!(error instanceof InputError)) {
      throw error;
    }

    $(messageId).textContent = error.message;
    $(messageId).scrollIntoView({ block: "center" });
  }
}

function checkedNumber(value) {
  if (!Number.isSafeInteger(value)) {
    throw new InputError("The calculated number is too large.");
  }

  return value;
}

function wholeNumber(value, label) {
  if (String(value).trim() === "") {
    throw new InputError(`${label} is required.`);
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > LIMIT
  ) {
    throw new InputError(
      `${label} must be a whole number from 0 to ${LIMIT}.`
    );
  }

  return number;
}

function signed(number) {
  return number > 0 ? `+${number}` : String(number);
}

function money(minorUnits, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    signDisplay: "exceptZero"
  }).format(minorUnits / 100);
}

function readRules() {
  const rateInput = $("point-rate");
  let rateMinor = null;

  if (rateInput.validity.badInput) {
    throw new InputError("Enter a valid amount per point.");
  }

  if (rateInput.value !== "") {
    const value = rateInput.value.trim();

    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
      throw new InputError(
        "Use a rate such as 1 or 2.50, with up to two decimal places."
      );
    }

    if (Number(value) > LIMIT) {
      throw new InputError("The rate is too large.");
    }

    const [whole, fraction = ""] = value.split(".");
    rateMinor = Number(whole) * 100 +
      Number(fraction.padEnd(2, "0"));
  }

  return {
    seen: wholeNumber($("seen-points").value, "Seen points"),
    unseen: wholeNumber($("unseen-points").value, "Unseen points"),
    dublee: wholeNumber($("dublee-points").value, "Dublee bonus"),
    foul: $("foul-points").value === ""
      ? null
      : wholeNumber($("foul-points").value, "Foul points"),
    currency: $("currency").value,
    rateMinor
  };
}

// PLAYER SETUP

function updatePlayerCount() {
  const named = players.filter((player) => player.name.trim());

  $("player-count").textContent =
    `${named.length} / ${MAX_PLAYERS} players`;

  $("add-player-button").disabled =
    players.length >= MAX_PLAYERS;

  $("add-player-button").textContent =
    players.length >= MAX_PLAYERS
      ? "10 seats added — remove one to add another"
      : "+ Add player";
}

function renderSetup() {
  $("player-list").replaceChildren();

  players.forEach((player, index) => {
    const row = element("div", "", "player-row");
    const label = element("label", `Player ${index + 1}`);
    const wrapper = element("div", "", "player-input-wrap");
    const input = element("input", "", "player-input");

    input.id = player.id;
    input.type = "text";
    input.maxLength = 40;
    input.placeholder = "Enter player name";
    input.value = player.name;
    label.htmlFor = input.id;

    const remove = element("button", "", "delete-player");
    remove.type = "button";

    remove.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true" focusable="false">
        <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>
      </svg>
    `;

    function updateRemoveLabel() {
      const text = `Remove ${player.name.trim() || `Player ${index + 1}`}`;
      remove.setAttribute("aria-label", text);
      remove.title = text;
    }

    updateRemoveLabel();

    input.addEventListener("input", () => {
      player.name = input.value;
      $("players-error").textContent = "";
      updateRemoveLabel();
      updatePlayerCount();
    });

    remove.addEventListener("click", () => {
      const existing = draft.entries.find(
        (entry) => entry.id === player.id
      );

      const needsConfirmation =
        player.name.trim() ||
        (existing && (
          existing.maal !== "0" ||
          existing.status !== "Unseen"
        ));

      if (
        needsConfirmation &&
        !window.confirm(
          "Remove this player from setup and the current draft? " +
          "Saved round history will remain."
        )
      ) {
        return;
      }

      players.splice(players.indexOf(player), 1);

      draft.entries = draft.entries.filter(
        (entry) => entry.id !== player.id
      );

      if (draft.winnerId === player.id) {
        draft.winnerId = null;
      }

      renderSetup();
      $("add-player-button").focus();
    });

    wrapper.append(input, remove);
    row.append(label, wrapper);
    $("player-list").append(row);
  });

  updatePlayerCount();
}

function addPlayer(focus = true) {
  if (players.length >= MAX_PLAYERS) {
    $("players-error").textContent = "Maximum ten setup seats.";
    return;
  }

  const player = {
    id: `player-${nextPlayerId++}`,
    name: ""
  };

  players.push(player);
  renderSetup();

  if (focus) {
    $(player.id).focus();
  }
}

function blankEntry(player) {
  return {
    id: player.id,
    name: player.name.trim(),
    maal: "0",
    status: "Unseen",
    seen: false,
    badInput: false
  };
}

function openDraftFromSetup() {
  const named = players.filter((player) => player.name.trim());

  if (named.length < 2) {
    throw new InputError("Enter at least two player names.");
  }

  const distinct = new Set(
    named.map((player) => player.name.trim().toLowerCase())
  );

  if (distinct.size !== named.length) {
    throw new InputError(
      "Use distinct display names, such as Madan K."
    );
  }

  const previous = new Map(
    draft.entries.map((entry) => [entry.id, entry])
  );

  draft.entries = named.map((player) => {
    const entry = previous.get(player.id) || blankEntry(player);
    entry.name = player.name.trim();
    return entry;
  });

  draft.sessionName =
    $("session-name").value.trim() || "Marriage session";

  draft.rules = readRules();

  if (!draft.entries.some((entry) =>
    entry.id === draft.winnerId && entry.status !== "Hold"
  )) {
    draft.winnerId = null;
  }

  renderRound();
  showScreen("round-screen", "round-heading");
}

// ROUND ENTRY

function refreshWinnerControls() {
  const select = $("round-winner-select");
  select.replaceChildren();

  const placeholder = element("option", "Select player");
  placeholder.value = "";
  select.append(placeholder);

  draft.entries.forEach((entry) => {
    const option = element("option", entry.name);
    option.value = entry.id;
    option.disabled = entry.status === "Hold";
    select.append(option);
  });

  select.value = draft.winnerId || "";

  $("round-player-list")
    .querySelectorAll(".winner-checkbox")
    .forEach((checkbox) => {
      checkbox.checked =
        checkbox.dataset.playerId === draft.winnerId;
    });

  updateCalculateLabel();
}

function renderRound() {
  const editing = parkedDraft !== null;

  $("round-heading").textContent =
    `${editing ? "Edit " : ""}Round ${draft.number}`;

  $("entry-caption").textContent =
    `Round ${draft.number} player entries`;

  $("round-session-name").textContent = draft.sessionName;

  $("round-rate").textContent = draft.rules.rateMinor === null
    ? "Points only — rate not set"
    : `${money(draft.rules.rateMinor, draft.rules.currency)
        .replace(/^\+/, "")} / point`;

  $("round-message").textContent = "";

  $("edit-notice").hidden = !editing;
  $("cancel-edit-button").hidden = !editing;
  $("round-home-button").hidden = editing;
  $("open-score-button").hidden = editing;
  $("edit-players-button").hidden = editing;

 updateCalculateLabel();


  $("round-player-list").replaceChildren();

  draft.entries.forEach((entry) => {
    const row = element("tr");
    const winnerCell = element("td");
    const nameCell = element("th", entry.name);
    const maalCell = element("td");
    const statusCell = element("td");

    nameCell.scope = "row";

    const winner = element("input", "", "winner-checkbox");
    winner.type = "checkbox";
    winner.dataset.playerId = entry.id;
    winner.setAttribute("aria-label", `${entry.name} wins`);

    const maal = element("input", "", "maal-input");
    maal.type = "number";
    maal.min = "0";
    maal.max = String(LIMIT);
    maal.step = "1";
    maal.value = entry.maal;
    maal.setAttribute("aria-label", `Maal for ${entry.name}`);

    const status = element("select", "", "round-status");
    status.setAttribute("aria-label", `Status for ${entry.name}`);

    ["Unseen", "Seen", "Dublee", "Foul", "Hold"].forEach((value) => {
      const option = element("option", value);
      option.value = value;
      status.append(option);
    });

    status.value = entry.status;

    const foulSeen = element("select", "", "foul-seen-status");
    foulSeen.setAttribute("aria-label", `Did ${entry.name} see Maal before the foul?`);
    [["unseen", "Maal unseen"], ["seen", "Maal seen"]].forEach(([value, text]) => {
      const option = element("option", text);
      option.value = value;
      foulSeen.append(option);
    });
    foulSeen.value = entry.seen ? "seen" : "unseen";
    foulSeen.hidden = entry.status !== "Foul";
    foulSeen.addEventListener("change", () => {
      entry.seen = foulSeen.value === "seen";
    });

    function applyHold() {
      const held = entry.status === "Hold";
      winner.disabled = held;
      maal.disabled = held;
      row.classList.toggle("is-paused", held);
    }

    winner.addEventListener("change", () => {
      if (
        winner.checked &&
        draft.winnerId &&
        draft.winnerId !== entry.id
      ) {
        $("round-message").textContent =
          "Only one winner is allowed. Uncheck the current winner first.";
      } else {
        draft.winnerId = winner.checked ? entry.id : null;
        $("round-message").textContent = "";
      }

      refreshWinnerControls();
    });

    maal.addEventListener("input", () => {
      entry.maal = maal.value;
      entry.badInput = maal.validity.badInput;

      if (!maal.validity.valid) {
        $("round-message").textContent =
          "Maal must be a non-negative whole number.";
        return;
      }

      $("round-message").textContent = "";

      if (Number(maal.value) > 0 && entry.status === "Unseen") {
        entry.status = "Seen";
        entry.seen = true;
        status.value = "Seen";

        $("round-message").textContent =
          `${entry.name} changed to Seen.`;
      }
    });

    status.addEventListener("change", () => {
      entry.status = status.value;

      if (entry.status === "Unseen") entry.seen = false;
      if (["Seen", "Dublee"].includes(entry.status)) {
        entry.seen = true;
      }
      foulSeen.hidden = entry.status !== "Foul";
      foulSeen.value = entry.seen ? "seen" : "unseen";

      $("round-message").textContent = "";

      if (entry.status === "Hold" && draft.winnerId === entry.id) {
        draft.winnerId = null;
        $("round-message").textContent =
          "A player on Hold cannot be the winner.";
      }

      applyHold();
      refreshWinnerControls();
    });

    applyHold();

    winnerCell.append(winner);
    maalCell.append(maal);
    statusCell.append(status, foulSeen);

    row.append(winnerCell, nameCell, maalCell, statusCell);
    $("round-player-list").append(row);
  });

  refreshWinnerControls();
  const previous = savedRounds.find((round) => round.number === draft.number - 1);
  const pending = previous?.pendingFouls || [];
  $("round-foul-note").textContent = pending.length
    ? "Previous-round fouls: " +
      pending.map((foul) => `${foul.name}: ${foul.points} points`).join("; ") +
      ". These will be deducted from the offenders and credited to this round's winner. " +
      "An offender winning this round cancels their own penalty."
    : "";
}

// CALCULATION

function calculateRound(source, previousRound = null) {
  const round = copy(source);

  const participants = round.entries.filter(
    (entry) => entry.status !== "Hold"
  );

  if (participants.length < 2) {
    throw new InputError("At least two players must participate.");
  }

  const winner = participants.find(
    (entry) => entry.id === round.winnerId
  );

  if (!winner) {
    throw new InputError("Select one participating winner.");
  }

  if (!["Seen", "Dublee"].includes(winner.status)) {
    throw new InputError(
      "Mark the winner as Seen, or Dublee if they finished through Dublee."
    );
  }

  participants.forEach((entry) => {
    if (entry.badInput) {
      throw new InputError(`Check the Maal entered for ${entry.name}.`);
    }

    entry.maal = wholeNumber(entry.maal, `${entry.name}'s Maal`);

    if (entry.status === "Unseen" && entry.maal > 0) {
      throw new InputError(
        `${entry.name} has positive Maal but is marked Unseen.`
      );
    }
  });

  const count = participants.length;
  const enteredTotalMaal = checkedNumber(
    participants.reduce((sum, entry) => sum + entry.maal, 0)
  );
  const dubleeBonus = winner.status === "Dublee"
    ? wholeNumber(round.rules.dublee, "Dublee finish Maal bonus")
    : 0;
  const totalMaal = checkedNumber(enteredTotalMaal + dubleeBonus);
  const foulPlayers = participants.filter((entry) => entry.status === "Foul");
  let foulPoints = 0;
  if (foulPlayers.length) {
    if (round.rules.foul === null || round.rules.foul === "") {
      throw new InputError("Set the foul penalty in Rules before saving a round with a Foul.");
    }
    foulPoints = wholeNumber(round.rules.foul, "Foul penalty");
  }
  const pendingFouls = foulPoints === 0 ? [] : foulPlayers.map((entry) => ({
    playerId: entry.id,
    name: entry.name,
    points: foulPoints,
    fromRound: round.number
  }));

  let winnerBonus = 0;

  const results = participants.map((entry) => {
    let payment = 0;

    if (entry.id !== winner.id) {
      if (entry.status === "Seen") payment = round.rules.seen;
      if (entry.status === "Unseen") payment = round.rules.unseen;
    }

    winnerBonus = checkedNumber(winnerBonus + payment);

    // Apply the bonus to effective Maal, never to the stored input.
    const maalBonus = entry.id === winner.id ? dubleeBonus : 0;
    const effectiveMaal = checkedNumber(entry.maal + maalBonus);

    return {
      ...entry,
      isWinner: entry.id === winner.id,
      maalBonus,
      effectiveMaal,
      netMaal: checkedNumber(count * effectiveMaal - totalMaal),
      gameAdjustment: -payment,
      played: true,
      foulAdjustment: 0,
      foulAdjustments: []
    };
  });

  // Derive carry-over from the previous recalculated round, never stored totals.
  if (previousRound && previousRound.number !== round.number - 1) {
    throw new InputError("Foul carry-over must come from the immediately preceding round.");
  }
  const incomingFouls = previousRound?.pendingFouls || [];
  const winningResult = results.find((result) => result.isWinner);
  incomingFouls.forEach((foul) => {
    let offender = results.find((result) => result.id === foul.playerId);
    if (!offender) {
      const currentEntry = round.entries.find((entry) => entry.id === foul.playerId);
      offender = {
        id: foul.playerId,
        name: currentEntry?.name || foul.name,
        maal: null,
        status: currentEntry?.status === "Hold" ? "Hold" : "Absent",
        seen: null,
        isWinner: false,
        maalBonus: 0,
        effectiveMaal: 0,
        netMaal: 0,
        gameAdjustment: 0,
        played: false,
        foulAdjustment: 0,
        foulAdjustments: []
      };
      results.push(offender);
    }
    const selfCancelled = offender.id === winner.id;
    offender.foulAdjustment = checkedNumber(offender.foulAdjustment - foul.points);
    offender.foulAdjustments.push({
      points: -foul.points, fromRound: foul.fromRound,
      counterpart: winningResult.name, selfCancelled
    });
    winningResult.foulAdjustment = checkedNumber(
      winningResult.foulAdjustment + foul.points
    );
    winningResult.foulAdjustments.push({
      points: foul.points, fromRound: foul.fromRound,
      counterpart: offender.name, selfCancelled
    });
  });

  results.forEach((result) => {
    if (result.isWinner) result.gameAdjustment = winnerBonus;

    result.basePoints = checkedNumber(result.netMaal + result.gameAdjustment);
    result.netPoints = checkedNumber(
      result.basePoints + result.foulAdjustment
    );

    result.amountMinor = round.rules.rateMinor === null
      ? null
      : checkedNumber(result.netPoints * round.rules.rateMinor);
  });

  const balance = results.reduce(
    (sum, result) => checkedNumber(sum + result.netPoints),
    0
  );

  if (balance !== 0) {
    throw new InputError("Scores do not balance. Round was not saved.");
  }

  return {
    ...round, enteredTotalMaal, dubleeBonus, totalMaal,
    participantCount: count, pendingFouls, results
  };
}

function recalculateHistory(rounds) {
  const rebuilt = [];
  rounds.forEach((round, index) => {
    if (round.number !== index + 1) {
      throw new InputError("Rounds must remain in sequential order.");
    }
    rebuilt.push(calculateRound(round, rebuilt[index - 1] || null));
  });
  return rebuilt;
}

// TABLE HELPERS

function appendHeadingRow(target, names) {
  const row = element("tr");
  const first = element("th", "Round / breakdown");
  first.scope = "col";
  row.append(first);

  names.forEach((name) => {
    const heading = element("th", name);
    heading.scope = "col";
    row.append(heading);
  });

  target.append(row);
}

function appendDataRow(target, label, cells, className = "") {
  const row = element("tr", "", className);
  const heading = element("th", label);
  heading.scope = "row";
  row.append(heading);

  cells.forEach((content) => {
    const cell = element("td");

    if (content instanceof Node) {
      cell.append(content);
    } else {
      cell.textContent = String(content);
    }

    row.append(cell);
  });

  target.append(row);
}

function scoreCell(result) {
  const wrapper = element("div");

  const score = element(
    "strong",
    `${result.isWinner ? "👑 " : ""}${signed(result.netPoints)}`,
    "score-number"
  );

  score.setAttribute(
    "aria-label",
    `${result.isWinner ? "Round winner, " : ""}${result.netPoints} points`
  );

  const status = element("span", "", "score-status");
  const seen = result.seen;

  // Fixed artwork only; user names are always assigned with textContent.
  status.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.8"
      aria-hidden="true" focusable="false">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
      <circle cx="12" cy="12" r="3"/>
      ${seen ? "" : '<path d="M3 3l18 18"/>'}
    </svg>
  `;

  status.append(document.createTextNode(
    `${seen ? "Seen" : "Unseen"}` +
    `${result.status === "Dublee" ? " · D" : ""}` +
    `${result.status === "Foul" ? " · Foul" : ""}`
  ));
  if (result.played === false) {
    status.textContent = `${result.status === "Hold" ? "Hold" : "Not played"} · F adjustment only`;
  }

  wrapper.append(score, status);
  if (result.foulAdjustments?.length) {
    const adjustment = element(
      "small",
      `${signed(result.basePoints)} ${result.foulAdjustment < 0 ? "−" : "+"} ` +
      `${Math.abs(result.foulAdjustment)} F = ${signed(result.netPoints)}`,
      "foul-score-note"
    );
    const explanation = result.foulAdjustments.map((item) =>
      `${signed(item.points)} F from Round ${item.fromRound}` +
      (item.selfCancelled ? " (own penalty cancels)" : ` / ${item.counterpart}`)
    ).join("; ");
    adjustment.title = explanation;
    adjustment.setAttribute("aria-label", explanation);
    wrapper.append(adjustment);
    if (result.foulAdjustments.some((item) => item.selfCancelled)) {
      wrapper.append(element("small", "Own foul cancelled", "foul-score-note"));
    }
  }
  return wrapper;
}

function historyNames() {
  const names = new Map();

  savedRounds.forEach((round) => {
    round.entries.forEach((entry) => names.set(entry.id, entry.name));
    round.results.forEach((result) => {
      if (!names.has(result.id)) names.set(result.id, result.name);
    });
  });

  return names;
}

function amountTotals(currency) {
  const rounds = savedRounds.filter(
    (round) => round.rules.currency === currency
  );

  const totals = new Map();

  if (rounds.some((round) => round.rules.rateMinor === null)) {
    return { complete: false, totals };
  }

  rounds.forEach((round) => {
    round.results.forEach((result) => {
      totals.set(
        result.id,
        checkedNumber(
          (totals.get(result.id) || 0) + result.amountMinor
        )
      );
    });
  });

  return { complete: true, totals };
}

// TWO-TABLE RESULTS SCREEN

function renderResults(number) {
  const round = savedRounds.find((item) => item.number === number);

  if (!round) {
    throw new InputError("No saved result exists for this round.");
  }

  selectedRoundNumber = number;

  $("results-heading").textContent = `Round ${number} Summary`;

  const winner = round.results.find((result) => result.isWinner);
  const rateText = round.rules.rateMinor === null
    ? "Rate not set"
    : `${money(round.rules.rateMinor, round.rules.currency)
        .replace(/^\+/, "")} / point`;

  $("results-meta").textContent =
    `${round.sessionName} · Winner: ${winner.name} 👑 · ` +
    `Total Maal: ${round.totalMaal}` +
    (round.dubleeBonus > 0
      ? ` (${round.enteredTotalMaal} entered + ${round.dubleeBonus} Dublee bonus)`
      : "") +
    ` · ${rateText}`;

  $("current-title").textContent = `Round ${number}`;
  $("current-caption").textContent =
    "Maal entered, final points and amount";

  $("current-summary-head").replaceChildren();
  $("current-summary-body").replaceChildren();

  appendHeadingRow(
    $("current-summary-head"),
    round.results.map((result) =>
      `${result.name}${result.isWinner ? " 👑" : ""}`
    )
  );

  appendDataRow(
    $("current-summary-body"),
    "Maal entered",
    round.results.map((result) => {
      if (result.played === false) return "— (not played)";
      if (!(result.maalBonus > 0)) return result.maal;
      const cell = element("div");
      cell.append(
        element("strong", String(result.maal)),
        element(
          "small",
          ` + ${result.maalBonus} D = ${result.effectiveMaal} Maal used`,
          "score-status"
        )
      );
      return cell;
    })
  );

  appendDataRow(
    $("current-summary-body"),
    "Total points",
    round.results.map(scoreCell)
  );

  appendDataRow(
    $("current-summary-body"),
    `Amount — ${round.rules.currency}`,
    round.results.map((result) =>
      result.amountMinor === null
        ? "Rate not set"
        : money(result.amountMinor, round.rules.currency)
    ),
    "money-row"
  );

  const names = historyNames();
  const ids = [...names.keys()];
  const pointTotals = new Map(ids.map((id) => [id, 0]));

  $("history-head").replaceChildren();
  $("history-body").replaceChildren();
  $("history-foot").replaceChildren();

  appendHeadingRow($("history-head"), [...names.values()]);

  savedRounds.forEach((saved) => {
  const points = [];

  ids.forEach((id) => {
    const result = saved.results.find((item) => item.id === id);
    const entry = saved.entries.find((item) => item.id === id);

    if (!result) {
      points.push(
        entry?.status === "Hold" ? "Hold" : "Not played"
      );
      return;
    }

    points.push(scoreCell(result));

    pointTotals.set(
      id,
      checkedNumber(pointTotals.get(id) + result.netPoints)
    );
  });

  appendDataRow(
    $("history-body"),
    `Round ${saved.number}`,
    points,
    "round-start"
  );

  const roundLabel = $("history-body").lastElementChild.firstElementChild;

  const editButton = element("button", "✎", "round-edit-button");
  editButton.type = "button";
  editButton.title = `Edit Round ${saved.number}`;
  editButton.setAttribute(
    "aria-label",
    `Edit Round ${saved.number}`
  );

  editButton.addEventListener("click", () => {
    runSafely("results-message", () => beginEdit(saved.number));
  });

  roundLabel.append(editButton);
});




  appendDataRow(
    $("history-foot"),
    "TOTAL POINTS",
    ids.map((id) => signed(pointTotals.get(id)))
  );

  const currencies = new Set(
    savedRounds.map((saved) => saved.rules.currency)
  );

  currencies.forEach((currency) => {
    const { complete, totals } = amountTotals(currency);

    appendDataRow(
      $("history-foot"),
      `TOTAL — ${currency}`,
      ids.map((id) =>
        complete
          ? money(totals.get(id) || 0, currency)
          : "Incomplete: rate missing"
      )
    );
  });

  const pending = savedRounds[savedRounds.length - 1]?.pendingFouls || [];
  $("results-message").textContent = pending.length
    ? "Pending foul points (not yet in totals): " +
      pending.map((foul) => `${foul.name}: ${foul.points} F`).join("; ") +
      ` → Round ${savedRounds.length + 1} winner. Final settlement remains incomplete until then.`
    : "";
  updateNextButton();
}

function openResults(number) {
  renderResults(number);
  showScreen("results-screen", "results-heading");
}

function updateNextButton() {
  const draftAlreadySaved = savedRounds.some(
    (round) => round.number === draft.number
  );

  $("next-game-button").textContent = draftAlreadySaved
    ? "Next Game →"
    : `Continue Round ${draft.number} →`;
}

function saveCalculation() {
  const number = draft.number;
  const candidate = copy(savedRounds);
  const index = savedRounds.findIndex(
    (round) => round.number === number
  );

  // Rebuild transactionally so an edit cannot leave later foul scores stale.
  if (index === -1) {
    candidate.push(copy(draft));
  } else {
    candidate[index] = copy(draft);
  }
  candidate.sort((a, b) => a.number - b.number);
  const rebuilt = recalculateHistory(candidate);
  savedRounds.splice(0, savedRounds.length, ...rebuilt);

  if (parkedDraft !== null) {
    if (parkedDraft.number === number) {
      parkedDraft = copy(draft);
    }
    draft = parkedDraft;
    parkedDraft = null;
  }

  $("start-round-button").textContent =
    `Continue Round ${draft.number} →`;

  openResults(number);
}

function nextGame() {
  const alreadySaved = savedRounds.some(
    (round) => round.number === draft.number
  );

  if (alreadySaved) {
    const previous = draft;
    const previousEntries = new Map(
      previous.entries.map((entry) => [entry.id, entry])
    );

    draft = {
      number: savedRounds.length + 1,
      sessionName: $("session-name").value.trim() || previous.sessionName,
      winnerId: null,
      rules: copy(previous.rules),
      entries: players
        .filter((player) => player.name.trim())
        .map((player) => {
          const entry = blankEntry(player);

          if (previousEntries.get(player.id)?.status === "Hold") {
            entry.status = "Hold";
          }

          return entry;
        })
    };
  }

  $("start-round-button").textContent =
    `Continue Round ${draft.number} →`;

  renderRound();
  showScreen("round-screen", "round-heading");
}

// EDIT SAVED ROUNDS WITHOUT LOSING THE CURRENT DRAFT

function beginEdit(number) {
  const saved = savedRounds.find((round) => round.number === number);

  if (!saved) {
    throw new InputError("Choose an existing round.");
  }

  parkedDraft = copy(draft);

  draft = {
    number: saved.number,
    sessionName: saved.sessionName,
    winnerId: saved.winnerId,
    rules: copy(saved.rules),
    entries: copy(saved.entries)
  };

  renderRound();
  showScreen("round-screen", "round-heading");
}

function cancelEdit() {
  if (parkedDraft === null) {
    return;
  }

  draft = parkedDraft;
  parkedDraft = null;
  openResults(selectedRoundNumber);
}

// SETTLEMENT INSTRUCTIONS ONLY — NO PAYMENT RECORDING

function renderSettlement() {
  const names = historyNames();
  const currencies = [...new Set(
    savedRounds.map((round) => round.rules.currency)
  )];

  $("settlement-content").replaceChildren();

  const pending = savedRounds[savedRounds.length - 1]?.pendingFouls || [];
  if (pending.length) {
    $("settlement-content").append(element(
      "p",
      "Final settlement is not ready: " +
      pending.map((foul) => `${foul.name} owes ${foul.points} pending foul points`).join("; ") +
      ". Complete the following round to determine the recipient. " +
      "These obligations have not been discarded or included in the displayed totals."
    ));
    return;
  }

  if (savedRounds.some((round) => round.rules.rateMinor === null)) {
    $("settlement-content").append(element(
      "p",
      "Cannot calculate a complete monetary settlement: " +
      "one or more saved rounds have no rate. Their points remain valid."
    ));
    return;
  }

  currencies.forEach((currency) => {
    const { totals } = amountTotals(currency);
    const debtors = [];
    const creditors = [];

    totals.forEach((amount, id) => {
      if (amount < 0) debtors.push({ id, amount: -amount });
      if (amount > 0) creditors.push({ id, amount });
    });

    const heading = element("h3", currency);
    $("settlement-content").append(heading);

    if (!debtors.length && !creditors.length) {
      $("settlement-content").append(
        element("p", "Everyone is balanced in this currency.")
      );
      return;
    }

    const totalDebt = debtors.reduce(
      (sum, item) => checkedNumber(sum + item.amount), 0
    );

    const totalCredit = creditors.reduce(
      (sum, item) => checkedNumber(sum + item.amount), 0
    );

    if (totalDebt !== totalCredit) {
      throw new InputError(
        "Settlement balances do not match. No instructions can be approved."
      );
    }

    const list = element("ul");
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (
      debtorIndex < debtors.length &&
      creditorIndex < creditors.length
    ) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const transfer = Math.min(debtor.amount, creditor.amount);

      list.append(element(
        "li",
        `${names.get(debtor.id)} → ${names.get(creditor.id)}: ` +
        money(transfer, currency).replace(/^\+/, "")
      ));

      debtor.amount -= transfer;
      creditor.amount -= transfer;

      if (debtor.amount === 0) debtorIndex += 1;
      if (creditor.amount === 0) creditorIndex += 1;
    }

    $("settlement-content").append(list);
  });
}

// EVENTS

$("rules-form").addEventListener("submit", (event) => {
  event.preventDefault();

  runSafely("rules-error", () => {
    readRules();
    showScreen("players-screen", "players-heading");
  });
});

$("players-home-button").addEventListener("click", goHome);
$("round-home-button").addEventListener("click", goHome);
$("results-home-button").addEventListener("click", goHome);

$("add-player-button").addEventListener("click", () => addPlayer());

$("start-round-button").addEventListener("click", () => {
  runSafely("players-error", openDraftFromSetup);
});

$("edit-players-button").addEventListener("click", () => {
  showScreen("players-screen", "players-heading");
});

$("round-winner-select").addEventListener("change", () => {
  draft.winnerId = $("round-winner-select").value || null;
  $("round-message").textContent = "";
  refreshWinnerControls();
});

$("calculate-button").addEventListener("click", () => {
  runSafely("round-message", saveCalculation);
});

$("open-score-button").addEventListener("click", () => {
  runSafely("round-message", () => {
    if (!savedRounds.length) {
      throw new InputError(
        "No saved scores yet. Calculate and save your first round."
      );
    }

    openResults(savedRounds[savedRounds.length - 1].number);
  });
});

$("resume-round-button").addEventListener("click", () => {
  renderRound();
  showScreen("round-screen", "round-heading");
});

$("next-game-button").addEventListener("click", () => {
  runSafely("results-message", nextGame);
});

$("edit-current-button").addEventListener("click", () => {
  runSafely("results-message", () => beginEdit(selectedRoundNumber));
});

$("edit-previous-button").addEventListener("click", () => {
  const select = $("edit-round-select");
  select.replaceChildren();

  savedRounds.forEach((round) => {
    const option = element("option", `Round ${round.number}`);
    option.value = String(round.number);
    select.append(option);
  });

  $("edit-dialog").showModal();
});

$("confirm-edit-button").addEventListener("click", () => {
  const number = Number($("edit-round-select").value);
  $("edit-dialog").close();

  runSafely("results-message", () => beginEdit(number));
});

$("close-edit-button").addEventListener("click", () => {
  $("edit-dialog").close();
});

$("cancel-edit-button").addEventListener("click", cancelEdit);

$("settle-button").addEventListener("click", () => {
  runSafely("results-message", () => {
    renderSettlement();
    $("settlement-dialog").showModal();
  });
});

$("close-settlement-button").addEventListener("click", () => {
  $("settlement-dialog").close();
});

function updateCalculateLabel() {
  let total = 0;
  let invalid = false;

  draft.entries.forEach((entry) => {
    if (entry.status === "Hold") {
      return;
    }

    const value = Number(entry.maal);

    if (
      entry.badInput ||
      String(entry.maal).trim() === "" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > LIMIT
    ) {
      invalid = true;
      return;
    }

    total += value;
  });

  const winner = draft.entries.find(
    (entry) => entry.id === draft.winnerId && entry.status === "Dublee"
  );
  let bonus = 0;
  if (winner) {
    const configured = draft.rules?.dublee;
    if (!Number.isSafeInteger(configured) || configured < 0 || configured > LIMIT) {
      invalid = true;
    } else {
      bonus = configured;
    }
  }

  $("calculate-button").textContent =
    `Calculate with total Maal (${invalid ? "?" : total + bonus})`;
  $("dublee-bonus-note").textContent = winner && !invalid
    ? `${winner.name}: ${winner.maal} entered + ${bonus} Dublee bonus. ` +
      "The bonus is included above; do not add it to the input again."
    : "";
}

$("round-player-list").addEventListener(
  "input",
  updateCalculateLabel
);

$("round-player-list").addEventListener(
  "change",
  updateCalculateLabel
);
// SESSION STORAGE
// This is separate from the scoring formula.

const STORAGE_KEY = "marriage-table.sessions.v1";

const RESUME_SCREENS = [
  "rules-screen",
  "players-screen",
  "round-screen",
  "results-screen"
];

const FORM_FIELDS = [
  "seen-points",
  "unseen-points",
  "dublee-points",
  "foul-points",
  "point-rate",
  "currency",
  "session-name"
];

const DEFAULT_FORM = Object.fromEntries(
  FORM_FIELDS.map((id) => [id, $(id).value])
);

let sessionLibrary = {
  version: 1,
  activeId: null,
  sessions: []
};

let currentSessionId = null;
let resumeScreen = "rules-screen";
let restoringSession = false;
let storageWritable = true;
let lastStoredText = null;
let unreadableStoredText = null;

function showStorageStatus(message, isError = false) {
  $("storage-status").textContent = message;
  $("storage-status").classList.toggle(
    "storage-error",
    isError
  );
}

function captureForm() {
  return Object.fromEntries(
    FORM_FIELDS.map((id) => [id, $(id).value])
  );
}

function restoreForm(values) {
  FORM_FIELDS.forEach((id) => {
    $(id).value = values[id];
  });
}

function captureSessionState() {
  return copy({
    players,
    savedRounds,
    nextPlayerId,
    selectedRoundNumber,
    parkedDraft,
    draft,
    form: captureForm(),
    screen: resumeScreen
  });
}

function sessionName(state) {
  return state.form["session-name"].trim() ||
    state.draft.sessionName ||
    "Untitled Marriage session";
}

function sessionDescription(session) {
  const state = session.state;
  const namedPlayers = state.players.filter(
    (player) => player.name.trim()
  ).length;

  let position;

  if (state.parkedDraft !== null) {
    position = `Editing Round ${state.draft.number}`;
  } else if (state.screen === "rules-screen") {
    position = "Rules setup";
  } else if (state.screen === "players-screen") {
    position = "Player setup";
  } else {
    const completed = state.savedRounds.some(
      (round) => round.number === state.draft.number
    );

    position = completed
      ? `Round ${state.draft.number} calculated`
      : `Round ${state.draft.number} in progress`;
  }

  return (
    `${namedPlayers} named players · ` +
    `${state.savedRounds.length} completed rounds\n` +
    `${position}\n` +
    `Last updated: ${new Date(session.updatedAt).toLocaleString()}`
  );
}

function orderedSessions() {
  return [...sessionLibrary.sessions].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt)
  );
}

function renderHome() {
  const sessions = orderedSessions();

  const latest = sessions.find(
    (session) => session.id === sessionLibrary.activeId
  ) || sessions[0];

  $("continue-card").hidden = !latest;

  $("continue-description").textContent = latest
    ? `${sessionName(latest.state)}\n${sessionDescription(latest)}`
    : "";

  $("continue-session-button").dataset.sessionId =
    latest ? latest.id : "";

  $("previous-sessions-list").replaceChildren();

  if (!sessions.length) {
    $("previous-sessions-list").append(
      element("p", "No sessions yet. Choose New Session to begin.")
    );
  }

  sessions.forEach((session) => {
    const card = element("article", "", "session-card");
    const title = element("h3", sessionName(session.state));
    const heading = element("div", "", "session-card-heading");
    const remove = element("button", "", "delete-session-button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete session: ${sessionName(session.state)}`);
    remove.title = `Delete session: ${sessionName(session.state)}`;
    remove.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true" focusable="false">
        <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>
      </svg>`;
    remove.addEventListener("click", () => requestSessionDeletion(session.id));
    heading.append(title, remove);
    const description = element(
      "p",
      sessionDescription(session),
      "muted"
    );

    description.style.whiteSpace = "pre-line";

    const open = element("button", "Open session →");
    open.type = "button";

    open.addEventListener("click", () => {
      continueSession(session.id);
    });

    card.append(heading, description, open);
    $("previous-sessions-list").append(card);
  });
}

let pendingSessionDeletion = null;

function requestSessionDeletion(id) {
  if (!saveActiveSession() || !storageWritable) {
    showStorageStatus("Deletion is paused because browser saving is unavailable. Export your work and resolve the storage warning first.", true);
    return;
  }
  const session = sessionLibrary.sessions.find((item) => item.id === id);
  if (!session) {
    showStorageStatus("That session no longer exists. Reopen Previous Sessions.", true);
    return;
  }
  pendingSessionDeletion = { id, snapshot: JSON.stringify(session) };
  const pendingFouls = session.state.savedRounds.at(-1)?.pendingFouls || [];
  $("delete-session-description").textContent =
    `"${sessionName(session.state)}" — ${session.state.savedRounds.length} completed rounds.` +
    (id === currentSessionId ? " This is your currently open session." : "") +
    (pendingFouls.length ? " It also contains unresolved foul points." : "");
  $("delete-session-error").textContent = "";
  $("delete-session-dialog").showModal();
  $("cancel-delete-session-button").focus();
}

function deleteSession(id, snapshot) {
  if (!storageWritable) throw new InputError("Saving is paused. No session was deleted.");
  const target = sessionLibrary.sessions.find((item) => item.id === id);
  if (!target || JSON.stringify(target) !== snapshot) {
    throw new InputError("This session changed since the confirmation opened. Cancel and review it again.");
  }
  const candidate = copy(sessionLibrary);
  candidate.sessions = candidate.sessions.filter((item) => item.id !== id);
  if (candidate.activeId === id) {
    candidate.activeId = [...candidate.sessions]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id || null;
  }
  const serialized = JSON.stringify(candidate);
  // Commit first: a storage error must leave both history and the active draft intact.
  try {
    if (localStorage.getItem(STORAGE_KEY) !== lastStoredText) {
      storageWritable = false;
      showStorageStatus("Another tab changed your sessions. Nothing was deleted. Export any unsaved work before reloading.", true);
      throw new InputError("Another tab changed the saved data. No session was deleted.");
    }
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (!(error instanceof DOMException)) throw error;
    throw new InputError(`Deletion could not be saved (${error.name}). No session was deleted.`);
  }
  sessionLibrary = candidate;
  lastStoredText = serialized;
  if (currentSessionId === id) {
    // Prevent autosave/page-hide events from resurrecting the deleted session.
    currentSessionId = null;
    players.splice(0);
    savedRounds.splice(0);
    nextPlayerId = 1;
    selectedRoundNumber = null;
    parkedDraft = null;
    draft = { number: 1, sessionName: "", winnerId: null, rules: null, entries: [] };
    resumeScreen = "rules-screen";
    restoreForm(DEFAULT_FORM);
    $("round-player-list").replaceChildren();
    ["current-summary-head", "current-summary-body", "history-head", "history-body", "history-foot"]
      .forEach((field) => $(field).replaceChildren());
    renderSetup();
  }
}

$("cancel-delete-session-button").addEventListener("click", () => {
  pendingSessionDeletion = null;
  $("delete-session-dialog").close();
});
$("delete-session-dialog").addEventListener("cancel", () => {
  pendingSessionDeletion = null;
});
$("confirm-delete-session-button").addEventListener("click", () => {
  $("delete-session-error").textContent = "";
  try {
    if (!pendingSessionDeletion) throw new InputError("Choose a session to delete first.");
    deleteSession(pendingSessionDeletion.id, pendingSessionDeletion.snapshot);
    pendingSessionDeletion = null;
    $("delete-session-dialog").close();
    renderHome();
    $("previous-sessions-heading").focus();
    showStorageStatus("Session deleted from this browser. Other sessions and exported backups were not changed.");
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    $("delete-session-error").textContent = error.message;
  }
});

function saveActiveSession() {
  if (restoringSession || currentSessionId === null) {
    return true;
  }

  const snapshot = {
    id: currentSessionId,
    updatedAt: new Date().toISOString(),
    state: captureSessionState()
  };

  const index = sessionLibrary.sessions.findIndex(
    (session) => session.id === currentSessionId
  );

  if (index === -1) {
    sessionLibrary.sessions.push(snapshot);
  } else {
    sessionLibrary.sessions[index] = snapshot;
  }

  sessionLibrary.activeId = currentSessionId;

  if (!storageWritable) {
    showStorageStatus(
      "Changes are in memory only. Export a backup before closing. " +
      "Browser saving is currently unavailable or paused.",
      true
    );
    return false;
  }

  let failure = null;

  try {
    const currentStoredText = localStorage.getItem(STORAGE_KEY);

    if (currentStoredText !== lastStoredText) {
      failure =
        "Another tab changed the saved sessions. Saving is paused " +
        "to avoid overwriting that work. Export this tab's backup, " +
        "then reload.";
    } else {
      const text = JSON.stringify(sessionLibrary);
      localStorage.setItem(STORAGE_KEY, text);
      lastStoredText = text;
    }
  } catch (error) {
    failure =
      `Browser saving failed: ${error.message}. ` +
      "Your changes remain in memory. Export a backup before closing.";
  }

  if (failure) {
    storageWritable = false;
    showStorageStatus(failure, true);
    return false;
  }

  showStorageStatus("Saved on this device.");
  return true;
}

// Check saved data before it is allowed to change the working app.
function validateSessionState(state) {
  function requireValid(condition, message) {
    if (!condition) {
      throw new InputError(`Saved session is invalid: ${message}`);
    }
  }

  function validRules(rules) {
    requireValid(rules && typeof rules === "object", "missing rules.");

    ["seen", "unseen", "dublee"].forEach((key) => {
      requireValid(typeof rules[key] === "number", `invalid ${key} points.`);
      wholeNumber(rules[key], `${key} points`);
    });

    if (rules.foul !== null) {
      requireValid(typeof rules.foul === "number", "invalid foul points.");
      wholeNumber(rules.foul, "foul points");
    }

    requireValid(
      ["NPR", "AUD", "INR", "USD", "GBP", "EUR"]
        .includes(rules.currency),
      "unsupported currency."
    );

    requireValid(
      rules.rateMinor === null ||
      (
        Number.isSafeInteger(rules.rateMinor) &&
        rules.rateMinor >= 0 &&
        rules.rateMinor <= LIMIT * 100
      ),
      "invalid rate."
    );
  }

  const usedIds = [];

  function validDraft(value) {
    requireValid(value && typeof value === "object", "missing draft.");

    requireValid(
      Number.isSafeInteger(value.number) && value.number >= 1,
      "invalid round number."
    );

    requireValid(
      typeof value.sessionName === "string",
      "invalid session name."
    );

    requireValid(
      Array.isArray(value.entries) &&
      value.entries.length <= MAX_PLAYERS,
      "invalid round entries."
    );

    if (value.rules !== null) {
      validRules(value.rules);
    }

    const ids = new Set();

    value.entries.forEach((entry) => {
      requireValid(
        entry &&
        typeof entry.id === "string" &&
        /^player-[1-9]\d*$/.test(entry.id) &&
        !ids.has(entry.id),
        "invalid or duplicate player ID."
      );

      ids.add(entry.id);
      usedIds.push(entry.id);

      requireValid(
        typeof entry.name === "string" &&
        entry.name.length <= 40,
        "invalid player name."
      );

      requireValid(
        typeof entry.maal === "string" ||
        (typeof entry.maal === "number" && Number.isFinite(entry.maal)),
        "invalid Maal field."
      );

      requireValid(
        ["Unseen", "Seen", "Dublee", "Foul", "Hold"]
          .includes(entry.status),
        "invalid status."
      );

      requireValid(
        typeof entry.seen === "boolean" &&
        typeof entry.badInput === "boolean",
        "invalid draft flags."
      );
    });

    requireValid(
      value.winnerId === null || ids.has(value.winnerId),
      "winner is not in the round."
    );
  }

  requireValid(state && typeof state === "object", "missing state.");

  requireValid(
    Array.isArray(state.players) &&
    state.players.length <= MAX_PLAYERS,
    "invalid player setup."
  );

  const setupIds = new Set();

  state.players.forEach((player) => {
    requireValid(
      player &&
      typeof player.id === "string" &&
      /^player-[1-9]\d*$/.test(player.id) &&
      !setupIds.has(player.id) &&
      typeof player.name === "string" &&
      player.name.length <= 40,
      "invalid setup player."
    );

    setupIds.add(player.id);
    usedIds.push(player.id);
  });

  requireValid(
    state.form && FORM_FIELDS.every(
      (id) => typeof state.form[id] === "string"
    ),
    "missing form values."
  );

  requireValid(
    RESUME_SCREENS.includes(state.screen),
    "invalid resume screen."
  );

  validDraft(state.draft);

  if (state.parkedDraft !== null) {
    validDraft(state.parkedDraft);
  }

  requireValid(Array.isArray(state.savedRounds), "missing round history.");

  state.savedRounds.forEach((round, index) => {
    validDraft(round);
    requireValid(round.rules !== null, "saved round has no rules.");

    requireValid(
      round.number === index + 1,
      "round history is not sequential."
    );

  });
  // Rebuild in order so persisted or edited foul bonuses are applied exactly once.
  state.savedRounds = recalculateHistory(state.savedRounds);

  requireValid(
    Number.isSafeInteger(state.nextPlayerId) &&
    state.nextPlayerId > 0 &&
    usedIds.every((id) =>
      Number(id.slice("player-".length)) < state.nextPlayerId
    ),
    "invalid next player ID."
  );

  requireValid(
    state.selectedRoundNumber === null ||
    state.savedRounds.some(
      (round) => round.number === state.selectedRoundNumber
    ),
    "invalid selected round."
  );

  const mainDraft = state.parkedDraft || state.draft;

  requireValid(
    mainDraft.number === state.savedRounds.length ||
    mainDraft.number === state.savedRounds.length + 1,
    "invalid current round."
  );

  if (state.parkedDraft !== null) {
    requireValid(
      state.screen === "round-screen" &&
      state.draft.rules !== null &&
      state.savedRounds.some(
        (round) => round.number === state.draft.number
      ) &&
      state.selectedRoundNumber !== null,
      "invalid saved edit."
    );
  }

  if (state.screen === "round-screen") {
    requireValid(state.draft.rules !== null, "round has no rules.");
  }

  if (state.screen === "results-screen") {
    requireValid(
      state.selectedRoundNumber !== null,
      "results have no selected round."
    );
  }

  return state;
}

function loadSessionLibrary() {
  let raw = null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    storageWritable = false;

    showStorageStatus(
      `Cannot access browser storage: ${error.message}. ` +
      "You can play in memory, but export before closing.",
      true
    );

    return;
  }

  lastStoredText = raw;

  if (raw === null) {
    showStorageStatus(
      "No saved sessions yet. Create a new session to begin."
    );
    return;
  }

  let loaded;

  try {
    loaded = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    unreadableStoredText = raw;
    storageWritable = false;

    showStorageStatus(
      "Saved data could not be read. It has not been overwritten. " +
      "Export a backup before trying to recover it.",
      true
    );

    return;
  }

  try {
    if (
      !loaded ||
      loaded.version !== 1 ||
      !Array.isArray(loaded.sessions)
    ) {
      throw new InputError("Unsupported saved-session format.");
    }

    const ids = new Set();

    loaded.sessions.forEach((session) => {
      if (
        !session ||
        typeof session.id !== "string" ||
        ids.has(session.id) ||
        typeof session.updatedAt !== "string" ||
        Number.isNaN(Date.parse(session.updatedAt))
      ) {
        throw new InputError("Invalid saved-session record.");
      }

      ids.add(session.id);
      session.state = validateSessionState(session.state);
    });

    if (
      loaded.activeId !== null &&
      !ids.has(loaded.activeId)
    ) {
      throw new InputError("The saved active session is missing.");
    }

    sessionLibrary = loaded;
    showStorageStatus("Saved sessions loaded from this device.");
  } catch (error) {
    if (!(error instanceof InputError)) {
      throw error;
    }

    unreadableStoredText = raw;
    storageWritable = false;

    showStorageStatus(
      `${error.message} Original saved data has not been overwritten. ` +
      "Export a backup for recovery.",
      true
    );
  }
}

function continueSession(id) {
  saveActiveSession();

  const session = sessionLibrary.sessions.find(
    (item) => item.id === id
  );

  if (!session) {
    showStorageStatus("That session could not be found.", true);
    return;
  }

  let state;

  try {
    state = validateSessionState(copy(session.state));
  } catch (error) {
    if (!(error instanceof InputError)) {
      throw error;
    }

    showStorageStatus(error.message, true);
    return;
  }

  restoringSession = true;

  try {
    currentSessionId = session.id;
    players.splice(0, players.length, ...state.players);
    savedRounds.splice(0, savedRounds.length, ...state.savedRounds);

    nextPlayerId = state.nextPlayerId;
    selectedRoundNumber = state.selectedRoundNumber;
    parkedDraft = state.parkedDraft;
    draft = state.draft;
    resumeScreen = state.screen;

    restoreForm(state.form);
    renderSetup();

    ["rules-error", "players-error", "round-message", "results-message"]
      .forEach((id) => { $(id).textContent = ""; });

    $("start-round-button").textContent =
      `Continue Round ${draft.number} →`;

    if (state.screen === "round-screen") {
      renderRound();
      showScreen("round-screen", "round-heading");
    } else if (state.screen === "results-screen") {
      renderResults(selectedRoundNumber);
      showScreen("results-screen", "results-heading");
    } else if (state.screen === "players-screen") {
      showScreen("players-screen", "players-heading");
    } else {
      showScreen("rules-screen", "home-heading");
    }
  } finally {
    restoringSession = false;
  }

  saveActiveSession();
}

function startNewSession() {
  saveActiveSession();

  const id = `session-${Date.now()}-${crypto.getRandomValues(
    new Uint32Array(1)
  )[0]}`;

  restoringSession = true;

  try {
    currentSessionId = id;
    players.splice(0);
    savedRounds.splice(0);

    nextPlayerId = 1;
    selectedRoundNumber = null;
    parkedDraft = null;
    resumeScreen = "rules-screen";

    draft = {
      number: 1,
      sessionName: "",
      winnerId: null,
      rules: null,
      entries: []
    };

    restoreForm(DEFAULT_FORM);

    ["rules-error", "players-error", "round-message", "results-message"]
      .forEach((id) => { $(id).textContent = ""; });

    for (let index = 0; index < DEFAULT_PLAYERS; index++) {
      addPlayer(false);
    }

    $("start-round-button").textContent = "Start Round 1 →";
    $("previous-sessions-panel").hidden = true;

    showScreen("rules-screen", "home-heading");
  } finally {
    restoringSession = false;
  }

  saveActiveSession();
}

function goHome() {
  showScreen("home-screen", "welcome-heading");
  renderHome();
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("rules-home-button").addEventListener("click", goHome);

$("new-session-button").addEventListener("click", startNewSession);

$("continue-session-button").addEventListener("click", () => {
  continueSession(
    $("continue-session-button").dataset.sessionId
  );
});

$("previous-sessions-button").addEventListener("click", () => {
  renderHome();
  $("previous-sessions-panel").hidden = false;
  $("previous-sessions-heading").focus();
});

$("export-sessions-button").addEventListener("click", () => {
  saveActiveSession();

  if (unreadableStoredText !== null) {
    downloadText(
      JSON.stringify({
        recoveryExport: true,
        originalSavedText: unreadableStoredText,
        currentInMemorySessions: sessionLibrary
      }, null, 2),
      "marriage-table-recovery.json",
      "application/json"
    );
    return;
  }

  downloadText(
    JSON.stringify(sessionLibrary, null, 2),
    "marriage-table-sessions.json",
    "application/json"
  );
});

// Imports add validated copies. They never replace an existing session.
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_SESSIONS = 100;
const MAX_IMPORT_ROUNDS = 1000;
let pendingImport = null;
let importReadNumber = 0;

function importCheck(condition, message) {
  if (!condition) throw new InputError(message);
}

function importText(value, limit, label) {
  importCheck(
    typeof value === "string" && value.length <= limit,
    `Invalid ${label} in backup.`
  );
  return value;
}

function importedRules(value) {
  if (value === null) return null;
  importCheck(
    value && typeof value === "object" && !Array.isArray(value),
    "Invalid rules in backup."
  );
  ["seen", "unseen", "dublee"].forEach((key) => {
    importCheck(Number.isSafeInteger(value[key]), `Invalid ${key} rule.`);
    wholeNumber(value[key], key);
  });
  if (value.foul !== null) {
    importCheck(Number.isSafeInteger(value.foul), "Invalid foul rule.");
    wholeNumber(value.foul, "Foul penalty");
  }
  importCheck(
    ["NPR", "AUD", "INR", "USD", "GBP", "EUR"].includes(value.currency),
    "Unsupported backup currency."
  );
  importCheck(
    value.rateMinor === null ||
    (Number.isSafeInteger(value.rateMinor) && value.rateMinor >= 0 &&
      value.rateMinor <= LIMIT * 100),
    "Invalid backup rate."
  );
  return {
    seen: value.seen, unseen: value.unseen, dublee: value.dublee,
    foul: value.foul, currency: value.currency, rateMinor: value.rateMinor
  };
}

function importedDraft(value) {
  importCheck(
    value && typeof value === "object" && !Array.isArray(value) &&
    Number.isSafeInteger(value.number) && value.number >= 1 &&
    value.number <= MAX_IMPORT_ROUNDS + 1 &&
    Array.isArray(value.entries) && value.entries.length <= MAX_PLAYERS,
    "Invalid round or draft in backup."
  );
  const ids = new Set();
  const entries = value.entries.map((entry) => {
    importCheck(entry && typeof entry === "object", "Invalid player entry.");
    const id = importText(entry.id, 50, "player ID");
    importCheck(/^player-[1-9]\d*$/.test(id) && !ids.has(id), "Invalid or duplicate player ID.");
    ids.add(id);
    importCheck(
      (typeof entry.maal === "string" && entry.maal.length <= 64) ||
      (typeof entry.maal === "number" && Number.isFinite(entry.maal)),
      "Invalid Maal entry."
    );
    importCheck(
      ["Unseen", "Seen", "Dublee", "Foul", "Hold"].includes(entry.status) &&
      typeof entry.seen === "boolean" && typeof entry.badInput === "boolean",
      "Invalid player status."
    );
    importCheck(
      !(entry.status === "Unseen" && entry.seen) &&
      !(["Seen", "Dublee"].includes(entry.status) && !entry.seen),
      "Seen/Unseen information contradicts the player status."
    );
    return {
      id, name: importText(entry.name, 40, "player name"),
      maal: entry.maal, status: entry.status,
      seen: entry.seen, badInput: entry.badInput
    };
  });
  importCheck(
    value.winnerId === null || ids.has(value.winnerId),
    "The backup winner is not in the round."
  );
  return {
    number: value.number,
    sessionName: importText(value.sessionName, 200, "session name"),
    winnerId: value.winnerId,
    rules: importedRules(value.rules),
    entries
  };
}

function importedState(value) {
  importCheck(
    value && typeof value === "object" &&
    Array.isArray(value.players) && value.players.length <= MAX_PLAYERS &&
    Array.isArray(value.savedRounds) && value.savedRounds.length <= MAX_IMPORT_ROUNDS &&
    value.form && typeof value.form === "object",
    `Invalid session, or more than ${MAX_IMPORT_ROUNDS} rounds in one session.`
  );
  const setup = value.players.map((player) => {
    importCheck(player && typeof player === "object", "Invalid setup player.");
    return {
      id: importText(player.id, 50, "player ID"),
      name: importText(player.name, 40, "player name")
    };
  });
  const form = Object.fromEntries(FORM_FIELDS.map((id) => [
    id, importText(value.form[id], id === "session-name" ? 60 : 64, id)
  ]));
  importCheck(
    ["NPR", "AUD", "INR", "USD", "GBP", "EUR"].includes(form.currency),
    "Invalid selected currency."
  );
  const rounds = value.savedRounds.map(importedDraft);
  rounds.forEach((round) => {
    const names = round.entries.map((entry) => entry.name.trim().toLowerCase());
    importCheck(
      names.every(Boolean) && new Set(names).size === names.length,
      "Saved rounds need distinct nonempty player names."
    );
  });
  // Copy only known fields; supplied result totals and extra properties are ignored.
  return validateSessionState({
    players: setup,
    savedRounds: rounds,
    nextPlayerId: value.nextPlayerId,
    selectedRoundNumber: value.selectedRoundNumber,
    parkedDraft: value.parkedDraft === null ? null : importedDraft(value.parkedDraft),
    draft: importedDraft(value.draft),
    form,
    screen: value.screen
  });
}

function parseSessionBackup(text) {
  importCheck(new Blob([text]).size <= MAX_IMPORT_BYTES, "Backup is larger than 2 MB.");
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new InputError("This file is not valid JSON. Choose an exported session backup.");
  }
  if (data?.recoveryExport) {
    throw new InputError(
      "This is a recovery export containing unreadable data, not a normal session backup. " +
      "Keep the file; it needs separate recovery review."
    );
  }
  importCheck(
    data && data.version === 1 && Array.isArray(data.sessions),
    "Unsupported file. Choose a version 1 Marriage Table session backup."
  );
  importCheck(
    data.sessions.length > 0 && data.sessions.length <= MAX_IMPORT_SESSIONS,
    `Choose a backup containing 1-${MAX_IMPORT_SESSIONS} sessions.`
  );
  let rounds = 0;
  const ids = new Set();
  const sessions = data.sessions.map((session) => {
    importCheck(session && typeof session === "object", "Invalid session record.");
    const id = importText(session.id, 160, "session ID");
    importCheck(id.trim() !== "" && !ids.has(id), "Empty or duplicate session ID.");
    ids.add(id);
    const updatedAt = importText(session.updatedAt, 40, "save date");
    importCheck(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt) &&
      !Number.isNaN(Date.parse(updatedAt)) &&
      new Date(updatedAt).toISOString() === updatedAt,
      "Invalid session save date."
    );
    rounds += Array.isArray(session.state?.savedRounds) ? session.state.savedRounds.length : 0;
    importCheck(rounds <= 5000, "Backup contains too many rounds (maximum 5,000).");
    return { id, updatedAt, state: importedState(session.state) };
  });
  importCheck(data.activeId === null || ids.has(data.activeId), "Backup refers to a missing active session.");
  return { version: 1, activeId: data.activeId, sessions };
}

function planSessionImport(incoming) {
  // Ignore metadata timestamps and compare normalized content, not names alone.
  const signatures = new Set(sessionLibrary.sessions.map(
    (session) => JSON.stringify(importedState(session.state))
  ));
  const additions = [];
  let skipped = 0;
  incoming.sessions.forEach((session) => {
    const signature = JSON.stringify(session.state);
    if (signatures.has(signature)) {
      skipped += 1;
    } else {
      signatures.add(signature);
      additions.push(session);
    }
  });
  return { additions, skipped };
}

function dismissImport() {
  pendingImport = null;
  $("import-dialog").close();
  $("import-sessions-file").value = "";
}

function commitSessionImport(incoming) {
  importCheck(storageWritable, "Browser saving is paused. Export your work and reload before importing.");
  const plan = planSessionImport(incoming);
  const candidate = copy(sessionLibrary);
  const usedIds = new Set(candidate.sessions.map((session) => session.id));
  let firstAddedId = null;
  plan.additions.forEach((session) => {
    let id = session.id;
    if (usedIds.has(id)) {
      do {
        id = `session-${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`;
      } while (usedIds.has(id));
    }
    usedIds.add(id);
    if (firstAddedId === null) firstAddedId = id;
    candidate.sessions.push({ ...copy(session), id });
  });
  if (candidate.activeId === null) candidate.activeId = firstAddedId;

  const serialized = JSON.stringify(candidate);
  // Write the complete result before changing the visible in-memory library.
  try {
    if (localStorage.getItem(STORAGE_KEY) !== lastStoredText) {
      storageWritable = false;
      showStorageStatus("Another tab changed your sessions. Import was stopped; export this tab's work before reloading.", true);
      throw new InputError("Sessions changed in another tab. Nothing was imported.");
    }
    if (plan.additions.length) localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (!(error instanceof DOMException)) throw error;
    throw new InputError(
      `Backup could not be saved (${error.name}). Nothing was imported. ` +
      "Storage may be full or unavailable; preserve your current backups."
    );
  }
  if (plan.additions.length) {
    sessionLibrary = candidate;
    lastStoredText = serialized;
  }
  return plan;
}

$("import-sessions-button").addEventListener("click", () => {
  if (!saveActiveSession() || !storageWritable) {
    $("import-status").textContent =
      "Import is unavailable while saving is paused. Export your work and resolve the storage warning first.";
    return;
  }
  $("import-status").textContent = "";
  $("import-sessions-file").value = "";
  $("import-sessions-file").click();
});

$("import-sessions-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const requestNumber = ++importReadNumber;
  pendingImport = null;
  $("import-status").textContent = "Reading backup on this device...";
  try {
    importCheck(file.size <= MAX_IMPORT_BYTES, "Backup is larger than 2 MB.");
    const incoming = parseSessionBackup(await file.text());
    if (requestNumber !== importReadNumber) return;
    const plan = planSessionImport(incoming);
    $("import-preview-summary").textContent =
      `${plan.additions.length} session(s) to add; ${plan.skipped} identical session(s) to skip.`;
    $("import-preview-list").replaceChildren();
    plan.additions.forEach((session) => {
      $("import-preview-list").append(element(
        "li",
        `${sessionName(session.state)} — ${session.state.savedRounds.length} completed rounds` +
        (sessionLibrary.sessions.some((existing) => existing.id === session.id)
          ? " — different version; will be kept as a separate copy" : "")
      ));
    });
    $("import-error").textContent = "";
    $("confirm-import-button").disabled = plan.additions.length === 0;
    pendingImport = incoming;
    $("import-status").textContent = "Review the backup before confirming. Nothing has been imported yet.";
    $("import-dialog").showModal();
  } catch (error) {
    if (requestNumber !== importReadNumber) return;
    if (!(error instanceof InputError) && !(error instanceof DOMException)) throw error;
    $("import-status").textContent = `Import stopped: ${error.message} Existing sessions were not replaced.`;
  }
});

$("confirm-import-button").addEventListener("click", () => {
  $("import-error").textContent = "";
  try {
    importCheck(pendingImport !== null, "Choose a backup first.");
    const result = commitSessionImport(pendingImport);
    dismissImport();
    renderHome();
    $("previous-sessions-panel").hidden = false;
    $("previous-sessions-heading").focus();
    $("import-status").textContent =
      `Imported and saved ${result.additions.length} session(s); skipped ${result.skipped} identical session(s). ` +
      "Open an imported session below to continue.";
    showStorageStatus("Backup import saved on this device. Existing sessions were preserved.");
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    $("import-error").textContent = error.message;
  }
});

$("cancel-import-button").addEventListener("click", dismissImport);
$("import-dialog").addEventListener("cancel", () => {
  pendingImport = null;
  $("import-status").textContent = "Import cancelled. No sessions were added.";
});

// These run after the existing controls update the application state.
document.addEventListener("input", (event) => {
  if (event.target.closest(
    "#rules-screen, #players-screen, #round-screen"
  )) {
    saveActiveSession();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.closest(
    "#rules-screen, #players-screen, #round-screen"
  )) {
    saveActiveSession();
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest(
    "#rules-screen, #players-screen, #round-screen, " +
    "#results-screen, #edit-dialog"
  )) {
    saveActiveSession();
  }
});

// Avoid silently overwriting another tab's work.
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    storageWritable = false;

    showStorageStatus(
      "Saved data changed in another tab. Saving is paused. " +
      "Export this tab's work, close other tabs, then reload.",
      true
    );
  }
});

// Save continuously; do not depend on an iPhone firing a close event.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveActiveSession();
  }
});

// Open on the front page, not inside a newly created session.
loadSessionLibrary();
renderHome();
showScreen("home-screen", "welcome-heading");
