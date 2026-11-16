document.addEventListener("DOMContentLoaded", () => {
  const gameContent = document.getElementById("game-content");
  const gamePickerButtons = document.querySelectorAll(".game-picker-button");

  if (!gameContent || !gamePickerButtons.length) {
    return;
  }

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
  const ticTacToe = { board: Array(9).fill(""), turn: "X", finished: false, status: "" };
  const memory = {
    cards: shuffledMemoryFaces(),
    flipped: [],
    matched: new Set(),
    locked: false,
    mismatchTimer: null
  };
  let activeGame = "tic-tac-toe";
  let mathRound = 1;
  let mathScore = 0;
  let mathQuestion = createMathQuestion();
  let mathAnswered = false;
  let mathFeedback = "";

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

  function renderTicTacToe() {
    const status = ticTacToe.status || `${ticTacToe.turn}'s turn`;
    const cells = ticTacToe.board.map((mark, index) => `
      <button class="game-cell game-cell-${mark.toLowerCase()}" type="button"
        data-action="tic-tac-toe-move" data-cell="${index}"
        aria-label="Cell ${index + 1}${mark ? `, ${mark}` : ", empty"}"
        ${mark || ticTacToe.finished ? "disabled" : ""}>${mark}</button>
    `).join("");

    gameContent.innerHTML = `
      <p class="game-title">Tic-tac-toe</p>
      <p class="game-status">${status}</p>
      <div class="game-board game-board-tic-tac-toe" role="group" aria-label="Tic-tac-toe board">${cells}</div>
      <button class="game-control" type="button" data-action="reset-tic-tac-toe">New round</button>
    `;
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

    gameContent.innerHTML = `
      <p class="game-title">Memory Match</p>
      <p class="game-status">${status}</p>
      <div class="game-board memory-board" role="group" aria-label="Memory Match cards">${cards}</div>
      <button class="game-control" type="button" data-action="reset-memory">Shuffle cards</button>
    `;
  }

  function renderQuickMath() {
    const answers = mathQuestion.choices.map((choice) => `
      <button class="game-control math-answer" type="button" data-action="answer-math"
        data-answer="${choice}" ${mathAnswered ? "disabled" : ""}>${choice}</button>
    `).join("");

    gameContent.innerHTML = `
      <p class="game-title">Quick Math</p>
      <p class="game-status">Round ${mathRound} · Score ${mathScore}</p>
      <p class="math-question" aria-label="${mathQuestion.prompt}">${mathQuestion.prompt} = ?</p>
      <div class="math-answers" role="group" aria-label="Choose the answer">${answers}</div>
      <p class="math-feedback" role="status">${mathFeedback}</p>
      ${mathAnswered ? '<button class="game-control" type="button" data-action="next-math">Next question</button>' : ""}
    `;
  }

  function renderGame() {
    gamePickerButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.game === activeGame));
    });

    if (activeGame === "tic-tac-toe") {
      renderTicTacToe();
    } else if (activeGame === "memory") {
      renderMemory();
    } else {
      renderQuickMath();
    }
  }

  gamePickerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeGame = button.dataset.game;
      renderGame();
    });
  });

  gameContent.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button[data-action]");
    if (!button) {
      return;
    }

    if (button.dataset.action === "tic-tac-toe-move") {
      const cell = Number(button.dataset.cell);
      if (ticTacToe.finished || ticTacToe.board[cell]) {
        return;
      }

      ticTacToe.board[cell] = ticTacToe.turn;
      const winner = winningLines.some((line) => line.every((index) => ticTacToe.board[index] === ticTacToe.turn));
      if (winner) {
        ticTacToe.status = `${ticTacToe.turn} wins!`;
        ticTacToe.finished = true;
      } else if (ticTacToe.board.every(Boolean)) {
        ticTacToe.status = "It's a draw!";
        ticTacToe.finished = true;
      } else {
        ticTacToe.turn = ticTacToe.turn === "X" ? "O" : "X";
        ticTacToe.status = "";
      }
      renderTicTacToe();
      return;
    }

    if (button.dataset.action === "reset-tic-tac-toe") {
      ticTacToe.board = Array(9).fill("");
      ticTacToe.turn = "X";
      ticTacToe.finished = false;
      ticTacToe.status = "";
      renderTicTacToe();
      return;
    }

    if (button.dataset.action === "flip-memory-card") {
      const card = Number(button.dataset.card);
      if (memory.locked || memory.matched.has(card) || memory.flipped.includes(card)) {
        return;
      }

      memory.flipped.push(card);
      if (memory.flipped.length === 2) {
        if (memory.cards[memory.flipped[0]] === memory.cards[memory.flipped[1]]) {
          memory.flipped.forEach((index) => memory.matched.add(index));
          memory.flipped = [];
        } else {
          memory.locked = true;
          renderMemory();
          memory.mismatchTimer = window.setTimeout(() => {
            memory.flipped = [];
            memory.locked = false;
            memory.mismatchTimer = null;
            if (activeGame === "memory") {
              renderMemory();
            }
          }, 700);
          return;
        }
      }
      renderMemory();
      return;
    }

    if (button.dataset.action === "reset-memory") {
      window.clearTimeout(memory.mismatchTimer);
      memory.mismatchTimer = null;
      memory.cards = shuffledMemoryFaces();
      memory.flipped = [];
      memory.matched.clear();
      memory.locked = false;
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
      renderQuickMath();
      return;
    }

    if (button.dataset.action === "next-math") {
      mathRound += 1;
      mathQuestion = createMathQuestion();
      mathAnswered = false;
      mathFeedback = "";
      renderQuickMath();
    }
  });

  renderGame();
});
