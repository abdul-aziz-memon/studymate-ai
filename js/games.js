const activityApiPromise = import("./activity.js").then(
  (activity) => ({ activity }),
  (error) => ({ error })
);

function createActivityId() {
  return crypto.randomUUID();
}

async function saveActivityRecord(activityId, record) {
  const { activity, error } = await activityApiPromise;
  if (error) {
    throw new Error("Activity tracking could not load from Firebase. Refresh the page to try again.");
  }
  return activity.saveActivityRecord(activityId, record);
}

document.addEventListener("DOMContentLoaded", () => {
  const gamesMenu = document.getElementById("games-menu");
  const gameStage = document.getElementById("game-stage");
  const gameChoices = document.querySelectorAll("[data-start-game]");
  const activitySaveStatus = document.getElementById("activity-save-status");

  if (!gamesMenu || !gameStage || !gameChoices.length) {
    return;
  }

  const gameNames = {
    "tic-tac-toe": "Tic-tac-toe",
    memory: "Memory Match",
    "quick-math": "Quick Math"
  };
  const ticTacToeDifficulties = {
    low: {
      label: "Low",
      description: "Goofy AI: it avoids easy wins and may finish your line for you."
    },
    mid: {
      label: "Mid",
      description: "The AI looks for wins and blocks obvious threats."
    },
    high: {
      label: "High",
      description: "The AI also sets up forks and tries to avoid your traps."
    },
    extreme: {
      label: "Extreme",
      description: "The AI uses its best strategy and will never lose."
    }
  };
  const winningLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  const memoryFaces = ["📚", "🚀", "🌱", "🧠"];
  const shuffledMemoryFaces = () => {
    const cards = [...memoryFaces, ...memoryFaces];
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
    }
    return cards;
  };
  const ticTacToe = { board: Array(9).fill(""), turn: "X", finished: false, thinking: false, status: "", difficulty: "mid", moves: [] };
  const memory = {
    cards: shuffledMemoryFaces(),
    flipped: [],
    matched: new Set(),
    locked: false,
    mismatchTimer: null,
    moves: [],
    attempts: 0
  };
  let selectedGame = null;
  let mathRound = 1;
  let mathScore = 0;
  let mathQuestion = createMathQuestion();
  let mathAnswered = false;
  let mathFeedback = "";
  let gameRecord = null;
  let gameElapsedMs = 0;
  let gameLastTick = performance.now();
  let gameClockActive = false;
  let gamesViewActive = false;
  let activityTrackingEnabled = true;
  let gameWriteQueue = Promise.resolve();
  let lastGameSnapshot = "";
  let aiTurnToken = 0;

  function updateGameClock() {
    const now = performance.now();
    if (gameClockActive) {
      gameElapsedMs += now - gameLastTick;
    }
    gameLastTick = now;
    gameClockActive = Boolean(
      gameRecord
      && !gameRecord.finished
      && selectedGame
      && gamesViewActive
      && document.visibilityState === "visible"
    );
  }

  function saveGameActivity() {
    updateGameClock();
    if (!activityTrackingEnabled || !gameRecord) {
      return;
    }
    const record = {
      type: "game",
      game: gameRecord.game,
      outcome: gameRecord.outcome,
      difficulty: gameRecord.difficulty,
      startedAtMs: gameRecord.startedAtMs,
      finishedAtMs: gameRecord.finishedAtMs,
      durationMs: Math.floor(gameElapsedMs),
      durationSeconds: Math.floor(gameElapsedMs / 1000),
      details: JSON.parse(JSON.stringify(gameRecord.details))
    };
    const snapshot = JSON.stringify(record);
    if (snapshot === lastGameSnapshot) {
      return;
    }
    lastGameSnapshot = snapshot;
    const activityId = gameRecord.id;
    gameWriteQueue = gameWriteQueue.catch(() => {}).then(() => saveActivityRecord(activityId, record));
    gameWriteQueue.then(() => {
      activitySaveStatus.textContent = "";
    }, (error) => {
      activityTrackingEnabled = false;
      console.error("Could not save game activity.", error);
      activitySaveStatus.textContent = error.message || "Could not save game activity to your dashboard.";
    });
  }

  function startGameRecord(name) {
    gameElapsedMs = 0;
    gameLastTick = performance.now();
    lastGameSnapshot = "";
    gameRecord = {
      id: createActivityId(),
      game: name,
      outcome: "in-progress",
      difficulty: name === "tic-tac-toe" ? ticTacToe.difficulty : null,
      startedAtMs: Date.now(),
      finishedAtMs: null,
      finished: false,
      details: name === "tic-tac-toe"
        ? { moves: [] }
        : name === "memory"
          ? { pairsFound: 0, attempts: 0, flips: 0, moves: [] }
          : { questionsAnswered: 0, correct: 0, incorrect: 0, rounds: [] }
    };
    updateGameClock();
    saveGameActivity();
  }

  function finishGameRecord(outcome) {
    if (!gameRecord || gameRecord.finished) {
      return;
    }
    updateGameClock();
    gameRecord.outcome = outcome;
    gameRecord.finishedAtMs = Date.now();
    gameRecord.finished = true;
    gameClockActive = false;
    saveGameActivity();
  }

  function closeGameRecord(outcome = "abandoned") {
    if (gameRecord && outcome === "abandoned" && gameRecord.game === "quick-math" && gameRecord.details.questionsAnswered > 0) {
      finishGameRecord("completed");
    } else {
      finishGameRecord(outcome);
    }
    gameRecord = null;
    gameClockActive = false;
    gameLastTick = performance.now();
    aiTurnToken += 1;
  }

  function startGameState(name) {
    if (name === "tic-tac-toe") {
      ticTacToe.board = Array(9).fill("");
      ticTacToe.turn = "X";
      ticTacToe.finished = false;
      ticTacToe.thinking = false;
      ticTacToe.status = "";
      ticTacToe.moves = [];
    } else if (name === "memory") {
      window.clearTimeout(memory.mismatchTimer);
      memory.cards = shuffledMemoryFaces();
      memory.flipped = [];
      memory.matched.clear();
      memory.locked = false;
      memory.mismatchTimer = null;
      memory.moves = [];
      memory.attempts = 0;
    } else {
      mathRound = 1;
      mathScore = 0;
      mathQuestion = createMathQuestion();
      mathAnswered = false;
      mathFeedback = "";
    }
    startGameRecord(name);
  }

  function createMathQuestion() {
    const operation = Math.floor(Math.random() * 3);
    let first = Math.floor(Math.random() * 10) + 2;
    let second = Math.floor(Math.random() * 10) + 2;
    let symbol;
    let answer;

    if (operation === 0) {
      symbol = "+";
      answer = first + second;
    } else if (operation === 1) {
      if (second > first) {
        [first, second] = [second, first];
      }
      symbol = "−";
      answer = first - second;
    } else {
      first = Math.floor(Math.random() * 8) + 2;
      second = Math.floor(Math.random() * 8) + 2;
      symbol = "×";
      answer = first * second;
    }

    const choices = new Set([answer]);
    while (choices.size < 4) {
      const offset = Math.floor(Math.random() * 11) - 5;
      if (offset !== 0 && answer + offset >= 0) {
        choices.add(answer + offset);
      }
    }

    return {
      prompt: `${first} ${symbol} ${second}`,
      answer,
      choices: [...choices].sort(() => Math.random() - 0.5)
    };
  }

  function renderGameFrame(name, status, content) {
    gameStage.innerHTML = `
      <div class="games-stage-actions">
        <button class="games-back-button" type="button" data-action="back-to-games">
          <span aria-hidden="true">←</span> All games
        </button>
        <button class="games-chat-button" type="button" data-app-view="chat">Back to chat</button>
      </div>
      <div class="game-play-card">
        <h2 class="game-title">${name}</h2>
        <p class="game-status" role="status" aria-live="polite">${status}</p>
        ${content}
      </div>
    `;
  }

  function renderTicTacToe() {
    const status = ticTacToe.status || "Your turn (X)";
    const cells = ticTacToe.board.map((mark, index) => `
      <button class="game-cell game-cell-${mark.toLowerCase()}" type="button"
        data-action="tic-tac-toe-move" data-cell="${index}"
        aria-label="Cell ${index + 1}${mark ? `, ${mark}` : ", empty"}"
        ${mark || ticTacToe.finished || ticTacToe.thinking ? "disabled" : ""}>${mark}</button>
    `).join("");
    renderGameFrame(gameNames["tic-tac-toe"], status, `
      <div class="game-difficulty">
        <label class="game-difficulty-label" for="tic-tac-toe-difficulty">AI difficulty</label>
        <select class="game-difficulty-select" id="tic-tac-toe-difficulty" name="tic-tac-toe-difficulty">
          ${Object.entries(ticTacToeDifficulties).map(([value, difficulty]) => `
            <option value="${value}" ${ticTacToe.difficulty === value ? "selected" : ""}>${difficulty.label}</option>
          `).join("")}
        </select>
        <p class="game-difficulty-description">${ticTacToeDifficulties[ticTacToe.difficulty].description}</p>
        <p class="game-player-hint">You are X · AI is O</p>
      </div>
      <div class="game-board game-board-tic-tac-toe" role="group" aria-label="Tic-tac-toe board">${cells}</div>
      <button class="game-control" type="button" data-action="reset-tic-tac-toe">New round</button>
    `);
  }

  function getWinner(board) {
    const winningLine = winningLines.find((line) => line.every((index) => board[index] && board[index] === board[line[0]]));
    return winningLine ? board[winningLine[0]] : "";
  }

  function findWinningMove(board, mark) {
    for (const line of winningLines) {
      const markedCells = line.filter((index) => board[index] === mark);
      const emptyCells = line.filter((index) => !board[index]);
      if (markedCells.length === 2 && emptyCells.length === 1) {
        return emptyCells[0];
      }
    }
    return -1;
  }

  function findForkMove(board, mark) {
    for (let index = 0; index < board.length; index += 1) {
      if (board[index]) {
        continue;
      }
      board[index] = mark;
      let threats = 0;
      for (const line of winningLines) {
        const markedCells = line.filter((cell) => board[cell] === mark);
        const emptyCells = line.filter((cell) => !board[cell]);
        if (markedCells.length === 2 && emptyCells.length === 1) {
          threats += 1;
        }
      }
      board[index] = "";
      if (threats > 1) {
        return index;
      }
    }
    return -1;
  }

  function getHighDifficultyMove(board) {
    const winningMove = findWinningMove(board, "O");
    if (winningMove !== -1) {
      return winningMove;
    }

    const blockingMove = findWinningMove(board, "X");
    if (blockingMove !== -1) {
      return blockingMove;
    }

    const forkMove = findForkMove(board, "O");
    if (forkMove !== -1) {
      return forkMove;
    }

    if (findForkMove(board, "X") !== -1) {
      for (let index = 0; index < board.length; index += 1) {
        if (board[index]) {
          continue;
        }
        board[index] = "O";
        const preventsFork = findForkMove(board, "X") === -1;
        board[index] = "";
        if (preventsFork) {
          return index;
        }
      }
    }

    if (!board[4]) {
      return 4;
    }

    const oppositeCorners = [[0, 8], [2, 6], [6, 2], [8, 0]];
    for (const [corner, opposite] of oppositeCorners) {
      if (board[opposite] === "X" && !board[corner]) {
        return corner;
      }
    }

    const corners = [0, 2, 6, 8].filter((index) => !board[index]);
    if (corners.length) {
      return corners[Math.floor(Math.random() * corners.length)];
    }
    const sides = [1, 3, 5, 7].filter((index) => !board[index]);
    return sides[Math.floor(Math.random() * sides.length)];
  }

  function getExtremeDifficultyMove(board) {
    function minimax(isAiTurn, depth) {
      const winner = getWinner(board);
      if (winner === "O") {
        return 10 - depth;
      }
      if (winner === "X") {
        return depth - 10;
      }
      if (board.every(Boolean)) {
        return 0;
      }

      let bestScore = isAiTurn ? -Infinity : Infinity;
      for (let index = 0; index < board.length; index += 1) {
        if (board[index]) {
          continue;
        }
        board[index] = isAiTurn ? "O" : "X";
        const score = minimax(!isAiTurn, depth + 1);
        board[index] = "";
        bestScore = isAiTurn ? Math.max(bestScore, score) : Math.min(bestScore, score);
      }
      return bestScore;
    }

    let bestScore = -Infinity;
    let bestMoves = [];
    for (let index = 0; index < board.length; index += 1) {
      if (board[index]) {
        continue;
      }
      board[index] = "O";
      const score = minimax(false, 1);
      board[index] = "";
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [index];
      } else if (score === bestScore) {
        bestMoves.push(index);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function finishTicTacToe(mark) {
    if (getWinner(ticTacToe.board)) {
      ticTacToe.status = mark === "X" ? "You win!" : "The AI wins!";
      ticTacToe.finished = true;
      ticTacToe.thinking = false;
      finishGameRecord(mark === "X" ? "win" : "loss");
    } else if (ticTacToe.board.every(Boolean)) {
      ticTacToe.status = "It's a draw!";
      ticTacToe.finished = true;
      ticTacToe.thinking = false;
      finishGameRecord("draw");
    }
    return ticTacToe.finished;
  }

  function makeAiMove() {
    const board = ticTacToe.board;
    let move;
    if (ticTacToe.difficulty === "low") {
      const playerWinningMove = findWinningMove(board, "X");
      if (playerWinningMove !== -1) {
        board[playerWinningMove] = "X";
        ticTacToe.moves.push({ mark: "X", player: "ai", cell: playerWinningMove, rule: "completed-player-line" });
        if (gameRecord) {
          gameRecord.details.moves = ticTacToe.moves;
        }
        finishTicTacToe("X");
        return;
      }
      const emptyCells = board.map((mark, index) => mark ? -1 : index).filter((index) => index !== -1);
      const movesThatDoNotWin = emptyCells.filter((index) => {
        board[index] = "O";
        const avoidsWinning = getWinner(board) !== "O";
        board[index] = "";
        return avoidsWinning;
      });
      const choices = movesThatDoNotWin.length ? movesThatDoNotWin : emptyCells;
      move = choices[Math.floor(Math.random() * choices.length)];
    } else if (ticTacToe.difficulty === "mid") {
      move = findWinningMove(board, "O");
      if (move === -1) {
        move = findWinningMove(board, "X");
      }
      if (move === -1 && !board[4]) {
        move = 4;
      }
      if (move === -1) {
        const emptyCells = board.map((mark, index) => mark ? -1 : index).filter((index) => index !== -1);
        move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      }
    } else if (ticTacToe.difficulty === "high") {
      move = getHighDifficultyMove(board);
    } else {
      move = getExtremeDifficultyMove(board);
    }

    if (move !== undefined && move !== -1) {
      board[move] = "O";
      ticTacToe.moves.push({ mark: "O", player: "ai", cell: move });
      if (gameRecord) {
        gameRecord.details.moves = ticTacToe.moves;
      }
      if (!finishTicTacToe("O")) {
        ticTacToe.turn = "X";
      }
      saveGameActivity();
    }
  }

  function renderMemory() {
    const isComplete = memory.matched.size === memory.cards.length;
    const status = isComplete
      ? "All pairs found! Great memory."
      : `${memory.matched.size / 2} of ${memory.cards.length / 2} pairs found`;
    const cards = memory.cards.map((face, index) => {
      const isVisible = memory.flipped.includes(index) || memory.matched.has(index);
      const label = isVisible ? `Card ${index + 1}, ${face}` : `Card ${index + 1}, hidden`;
      return `
        <button class="memory-card" type="button" data-action="flip-memory-card"
          data-card="${index}" aria-label="${label}" aria-pressed="${isVisible}"
          ${memory.matched.has(index) || memory.locked ? "disabled" : ""}>
          ${isVisible ? face : "?"}
        </button>
      `;
    }).join("");
    renderGameFrame(gameNames.memory, status, `
      <div class="game-board memory-board" role="group" aria-label="Memory Match cards">${cards}</div>
      <button class="game-control" type="button" data-action="reset-memory">Shuffle cards</button>
    `);
  }

  function renderQuickMath() {
    const answers = mathQuestion.choices.map((choice) => `
      <button class="game-control math-answer" type="button" data-action="answer-math"
        data-answer="${choice}" ${mathAnswered ? "disabled" : ""}>${choice}</button>
    `).join("");
    renderGameFrame(gameNames["quick-math"], `Round ${mathRound} · Score ${mathScore}`, `
      <p class="math-question" aria-label="${mathQuestion.prompt}">${mathQuestion.prompt} = ?</p>
      <div class="math-answers" role="group" aria-label="Choose the answer">${answers}</div>
      <p class="math-feedback" role="status">${mathFeedback}</p>
      ${mathAnswered ? '<button class="game-control" type="button" data-action="next-math">Next question</button>' : ""}
    `);
  }

  function showGameMenu() {
    closeGameRecord();
    aiTurnToken += 1;
    selectedGame = null;
    gamesMenu.hidden = false;
    gameStage.hidden = true;
    gameStage.replaceChildren();
  }

  function startGame(name) {
    if (!Object.hasOwn(gameNames, name)) {
      return;
    }
    closeGameRecord();
    selectedGame = name;
    startGameState(name);
    gamesMenu.hidden = true;
    gameStage.hidden = false;
    renderSelectedGame();
  }

  function renderSelectedGame() {
    if (selectedGame === "tic-tac-toe") {
      renderTicTacToe();
    } else if (selectedGame === "memory") {
      renderMemory();
    } else if (selectedGame === "quick-math") {
      renderQuickMath();
    }
  }

  gameChoices.forEach((button) => {
    button.addEventListener("click", () => startGame(button.dataset.startGame));
  });

  gameStage.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const appViewButton = target?.closest("[data-app-view]");
    if (appViewButton) {
      document.dispatchEvent(new CustomEvent("studymate:navigate-view", { detail: appViewButton.dataset.appView }));
      return;
    }
    const button = target?.closest("button[data-action]");
    if (!button) {
      return;
    }

    if (button.dataset.action === "back-to-games") {
      showGameMenu();
      return;
    }

    if (button.dataset.action === "tic-tac-toe-move") {
      const cell = Number(button.dataset.cell);
      if (ticTacToe.finished || ticTacToe.thinking || !Number.isInteger(cell) || cell < 0 || cell >= ticTacToe.board.length || ticTacToe.board[cell]) {
        return;
      }
      ticTacToe.board[cell] = "X";
      ticTacToe.moves.push({ mark: "X", player: "human", cell });
      if (gameRecord) {
        gameRecord.details.moves = ticTacToe.moves;
      }
      if (!finishTicTacToe("X")) {
        ticTacToe.turn = "O";
        ticTacToe.thinking = true;
        ticTacToe.status = "AI is thinking...";
        const turnToken = ++aiTurnToken;
        renderTicTacToe();
        saveGameActivity();
        window.setTimeout(() => {
          if (selectedGame !== "tic-tac-toe" || ticTacToe.finished || turnToken !== aiTurnToken) {
            return;
          }
          ticTacToe.thinking = false;
          ticTacToe.status = "";
          makeAiMove();
          renderTicTacToe();
        }, 1000);
        return;
      }
      saveGameActivity();
      renderTicTacToe();
      return;
    }

    if (button.dataset.action === "reset-tic-tac-toe") {
      closeGameRecord();
      startGameState("tic-tac-toe");
      ticTacToe.board = Array(9).fill("");
      ticTacToe.turn = "X";
      ticTacToe.finished = false;
      ticTacToe.thinking = false;
      ticTacToe.status = "";
      ticTacToe.moves = [];
      aiTurnToken += 1;
      renderTicTacToe();
      return;
    }

    if (button.dataset.action === "flip-memory-card") {
      const card = Number(button.dataset.card);
      if (memory.locked || memory.matched.has(card) || memory.flipped.includes(card)) {
        return;
      }
      memory.flipped.push(card);
      memory.moves.push({ card, face: memory.cards[card] });
      if (gameRecord) {
        gameRecord.details.moves = memory.moves;
        gameRecord.details.flips = memory.moves.length;
      }
      if (memory.flipped.length === 2) {
        memory.attempts += 1;
        if (gameRecord) {
          gameRecord.details.attempts = memory.attempts;
        }
        if (memory.cards[memory.flipped[0]] === memory.cards[memory.flipped[1]]) {
          memory.flipped.forEach((index) => memory.matched.add(index));
          if (gameRecord) {
            gameRecord.details.pairsFound = memory.matched.size / 2;
          }
          memory.flipped = [];
          if (memory.matched.size === memory.cards.length) {
            finishGameRecord("win");
          }
        } else {
          memory.locked = true;
          saveGameActivity();
          renderMemory();
          memory.mismatchTimer = window.setTimeout(() => {
            memory.flipped = [];
            memory.locked = false;
            memory.mismatchTimer = null;
            if (selectedGame === "memory") {
              renderMemory();
            }
          }, 700);
          return;
        }
      }
      saveGameActivity();
      renderMemory();
      return;
    }

    if (button.dataset.action === "reset-memory") {
      closeGameRecord(memory.matched.size === memory.cards.length ? "win" : "abandoned");
      window.clearTimeout(memory.mismatchTimer);
      startGameState("memory");
      renderMemory();
      return;
    }

    if (button.dataset.action === "answer-math" && !mathAnswered) {
      const isCorrect = Number(button.dataset.answer) === mathQuestion.answer;
      mathAnswered = true;
      mathFeedback = isCorrect ? "Correct! Nice work." : `Not quite — the answer is ${mathQuestion.answer}.`;
      if (isCorrect) {
        mathScore += 1;
      }
      if (gameRecord) {
        gameRecord.details.questionsAnswered += 1;
        gameRecord.details[isCorrect ? "correct" : "incorrect"] += 1;
        gameRecord.details.rounds.push({
          round: mathRound,
          question: mathQuestion.prompt,
          answer: mathQuestion.answer,
          selected: Number(button.dataset.answer),
          correct: isCorrect
        });
      }
      saveGameActivity();
      renderQuickMath();
      return;
    }

    if (button.dataset.action === "next-math") {
      mathRound += 1;
      mathQuestion = createMathQuestion();
      mathAnswered = false;
      mathFeedback = "";
      saveGameActivity();
      renderQuickMath();
    }
  });

  gameStage.addEventListener("change", (event) => {
    const target = event.target;
    if (target?.id !== "tic-tac-toe-difficulty" || !Object.hasOwn(ticTacToeDifficulties, target.value)) {
      return;
    }
    closeGameRecord();
    ticTacToe.difficulty = target.value;
    startGameState("tic-tac-toe");
    renderTicTacToe();
    gameStage.querySelector("#tic-tac-toe-difficulty")?.focus();
  });

  document.addEventListener("studymate:show-view", (event) => {
    gamesViewActive = event.detail === "games";
    if (event.detail === "games") {
      showGameMenu();
    } else {
      updateGameClock();
      closeGameRecord();
    }
  });

  document.addEventListener("visibilitychange", () => {
    updateGameClock();
    saveGameActivity();
  });
  window.addEventListener("beforeunload", () => closeGameRecord());
  window.setInterval(saveGameActivity, 10000);

  showGameMenu();
});
