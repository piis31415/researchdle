import { useEffect, useRef, useState } from "react";
import { Row, RowState } from "./Row";
import { Clue, clue, describeClue, violation } from "./clue";
import { Timer, Timer2, Time } from "./Timer";
import { Keyboard } from "./Keyboard";
import {
  describeSeed,
  Difficulty,
  gameName,
  resetRng,
  seed,
  speak,
  urlParam,
  WordList,
} from "./util";
import { decode, encode } from "./base64";
import Dictionary from "./Dictionary";

enum GameState {
  Playing,
  Won,
  Lost,
  Copied
}

interface GameProps {
  maxGuesses: number;
  hidden: boolean;
  difficulty: Difficulty;
  colorBlind: boolean;
  topbar: boolean;
  autoenter: boolean;
  runlen: number;
  keyboardLayout: string;
  autoguess: string;
  noev: boolean;
  firstKeyTiming: boolean;
  delay: number;
  penalty: number;
  blind: boolean;
  nokbd: boolean;
  chlink: any; // TODO lol
  wordlist: WordList;
}

const minLength = 4;
const defaultLength = Math.floor(Math.random() * 4 + 4);
const maxLength = 11;
const limitLength = (n: number) =>
  n >= minLength && n <= maxLength ? n : defaultLength;
const randLength = () =>
  Math.floor(Math.random() * 4 + 4);
function getChallengeUrl(target: string): string {
  return (
    window.location.origin +
    window.location.pathname +
    "?challenge=" +
    encode(target)
  );
}

let initChallenge = "";
let challengeError = false;
try {
  initChallenge = decode(urlParam("challenge") ?? "").toLowerCase();
} catch (e) {
  console.warn(e);
  challengeError = true;
}
// TODO wordlist
if (initChallenge && !Dictionary.checkWord(WordList.HelloWordl, initChallenge)) {
  initChallenge = "";
  challengeError = true;
}

function parseUrlLength(): number {
  const lengthParam = urlParam("length");
  if (!lengthParam) return defaultLength;
  return limitLength(Number(lengthParam));
}

function parseUrlGameNumber(): number {
  const gameParam = urlParam("game");
  if (!gameParam) return 1;
  const gameNumber = Number(gameParam);
  return gameNumber >= 1 && gameNumber <= 1000 ? gameNumber : 1;
}

function Game(props: GameProps) {
  const [count, setCount] = useState<string>(window.localStorage.getItem("count") || "1");
  const [gameState, setGameState] = useState(GameState.Playing);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [starttime, setStarttime] = useState<number>(+new Date());
  const [currentGuess, setCurrentGuess] = useState<string>("");
  const [challenge, setChallenge] = useState<string>(initChallenge);
  const [wordLength, setWordLength] = useState(
    challenge ? challenge.length : parseUrlLength()
  );
  const [gameNumber, setGameNumber] = useState(parseUrlGameNumber());
  const [target, setTarget] = useState(() => {
    resetRng();
    // Skip RNG ahead to the parsed initial game number:
    for (let i = 1; i < gameNumber; i++) Dictionary.randomTarget(props.wordlist, wordLength);
    return challenge || Dictionary.randomTarget(props.wordlist, wordLength);
  });
  const [hint, setHint] = useState<string>(
    challengeError
      ? `Invalid challenge string, playing random game.`
      : `Make your first guess!`
  );
  const [times, setTimes] = useState<Time[]>([{
    word: '',
    time: +new Date(),
    firstKey: +new Date(),
    penalty: 0,
    correct: true
  }]);
  const [firstKey, setFirstKey] = useState<number | undefined>(undefined);
  const [revealStep, setRevealStep] = useState<number>(-1);

  const currentSeedParams = () =>
    `?seed=${seed}&length=${wordLength}&game=${gameNumber}`;
  useEffect(() => {
    if (seed) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + currentSeedParams()
      );
    }
  }, [wordLength, gameNumber]);
  const tableRef = useRef<HTMLTableElement>(null);
  const startNextGame = () => {
    if (challenge) {
      // Clear the URL parameters:
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setChallenge("");
    const newWordLength = randLength();
    setWordLength(newWordLength);
    setTarget(Dictionary.randomTarget(props.wordlist, newWordLength));
    setHint("");
    setGuesses([]);
    setCount((parseInt(count)+1).toString());
    setStarttime(+new Date());
    setCurrentGuess("");
    setGameState(GameState.Playing);
    setGameNumber((x) => x + 1);
    setFirstKey(undefined);
    doAutoguess();
  };
  const newWithLength = (length: (_: number) => number) => {
    resetRng();
    setGameNumber(1);
    setGameState(GameState.Playing);
    setGuesses([]);
    setCurrentGuess("");
    setWordLength(pre => {
        const post = length(pre);
        setTarget(Dictionary.randomTarget(props.wordlist, post));
        setHint(`${post} letters`);
        return post;
    });
  };

  const autoguesses =
    props.autoguess.toLowerCase().replace(/[^a-z]+/g, ' ').split(' ').filter(x => x).slice(0,5);
  const doAutoguess = () => {
    autoguesses.forEach(x => submit(x, true));
  };

  useEffect(doAutoguess, []);

  async function share(text?: string) {
    const url = seed
      ? window.location.origin + window.location.pathname + currentSeedParams()
      : getChallengeUrl(target);
    const body = (text ? text : "");
    if (
      /android|iphone|ipad|ipod|webos/i.test(navigator.userAgent) &&
      !/firefox/i.test(navigator.userAgent)
    ) {
      try {
        await navigator.share({ text: body });
        return;
      } catch (e) {
        console.warn("navigator.share failed:", e);
      }
    }
    try {
      await navigator.clipboard.writeText(body);
      return;
    } catch (e) {
      console.warn("navigator.clipboard.writeText failed:", e);
    }
    setHint(url);
  }

  const inGame = gameState === GameState.Playing &&
      (guesses.length > 0 || currentGuess !== "" || challenge !== "");
  const onKey = (key: string) => {
    if (gameState === GameState.Won || gameState === GameState.Lost) {
      if (key === "Enter") {
        setHint("Press Enter to begin the next Wordle");
        setGameState(GameState.Copied);
      }
      return;
    }
    if (gameState === GameState.Copied) {
      if (key === "Enter") {
        startNextGame();
      }
      return;
    }
    if (guesses.length === props.maxGuesses) return;
    if (/^[a-z]$/i.test(key)) {
      setFirstKey(k => k ?? +new Date());
      setCurrentGuess((guess) =>
        (guess + key.toLowerCase()).slice(0, wordLength)
      );
      if (props.autoenter && currentGuess.length === wordLength - 1) {
        if (submit(currentGuess + key.toLowerCase()) === 1) return;
      } else {
        setHint("");
      }
      tableRef.current?.focus();
    } else if (key === "Backspace") {
      setCurrentGuess((guess) => guess.slice(0, -1));
      setHint("");
    } else if (key === "Enter") {
      submit(currentGuess);
    } else if (!inGame && key === "ArrowLeft") {
      newWithLength((x: number) => Math.max(x-1, minLength));
    } else if (!inGame && key === "ArrowRight") {
      newWithLength((x: number) => Math.min(x+1, maxLength));
    }
  };

  const diffstring =
    props.difficulty === Difficulty.Normal ? 'N' :
    props.difficulty === Difficulty.Hard ? 'H' :
    props.difficulty === Difficulty.UltraHard ? 'U' : '';

  const lenstring =
    props.wordlist === WordList.NewYorkTimes ? '*' : wordLength+'';

  const variants =
    (props.blind ? 'B' : '') +
    (props.nokbd ? 'K' : '');

  const mode = `v01-${diffstring}${lenstring}x${props.runlen}` +
      (props.autoenter || autoguesses.length ?
       `-a${props.autoenter ? 1 : 0}${autoguesses.length}` : '') +
      (props.delay ?
       `-d${Math.round(props.delay*10)}` : '') +
      (props.penalty ?
       `-p${Math.round(props.penalty*10)}` : '') +
      (variants ?
       `/${variants}` : '');


  const copy = (correct: boolean) => {
    const emoji = props.colorBlind
                ? ["⬛", "🟦", "🟧"]
                : ["⬛", "🟨", "🟩"];
    const score = correct ? guesses.length : "X";
    const time = (+new Date() - starttime)/1000;
    share(
      `${gameName} ${score}/${props.maxGuesses} ${time}\n` + 
      `${target}\n` +
        guesses
          .map((guess) =>
            clue(guess, target)
              .map((c) => emoji[c.clue ?? 0])
              .join("")
          )
          .join("\n")
    );
  };

  const log = (target: string, correct: boolean) => {
      const time = +new Date(), dur = time - starttime;
      setTimes(times => [...times, {
        word: target,
        time: dur,
        firstKey: firstKey ?? time,
        penalty: guesses.length * props.penalty,
        correct
      }]);
      localStorage.setItem('log_'+mode,
                           (localStorage.getItem('log_'+mode) || '') +
                               ',' + target + ' ' + (correct ? dur : 0));
      copy(correct);
  };

  const submit = (guess: string, autoing: boolean = false) => {
    if (guess.length !== wordLength) {
      setHint("Too short");
      return;
    }
    if (!Dictionary.checkWord(props.wordlist, guess)) {
      setHint("Not a valid word");
      return;
    }
    if (!autoing) {
      for (const g of guesses) {
        const c = clue(g, target);
        const feedback = violation(props.difficulty, c, guess);
        if (feedback) {
          setHint(feedback);
          return;
        }
      }
    }

    if (props.delay && !autoing) {
        setRevealStep(0);
        let start: number | undefined = undefined;
        const fn = (t: number) => {
            if (start === undefined) start = t;
            const step = Math.ceil(((t - start) / 1000) / props.delay * 5);
            if (step === 6) {
                setRevealStep(-1);
                submitVerified(guess, autoing);
            } else {
                setRevealStep(step);
                requestAnimationFrame(fn);
            }
        };
        requestAnimationFrame(fn);
    } else {
        submitVerified(guess, autoing);
    }
    return 1;
  };

  const submitVerified = (guess: string, autoing: boolean) => {
    setGuesses((guesses) => guesses.concat([guess]));
    setCurrentGuess((guess) => "");

    const gameOver = (verbed: string) =>
      `You ${verbed}! The answer was ${target.toUpperCase()}. The results have been copied to the clipboard; please paste them in the Google form below. (Enter to proceed)`;

    if (autoing) {
      // nop (TODO what if it's right lmao)
    } else if (guess === target) {
      setHint(gameOver("won"));
      setGameState(GameState.Won);
      log(target, true);
      if (props.autoenter) startNextGame();
    } else if (guesses.length + 1 === props.maxGuesses) {
      setHint(gameOver("lost"));
      setGameState(GameState.Lost);
      log(target, false);
      // if (props.autoenter) startNextGame();
    } else {
      setHint("");
      speak(describeClue(clue(guess, target)));
    }
  };

  const noev = props.noev;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (noev || revealStep !== -1) return;
      if (!e.ctrlKey && !e.metaKey) {
        onKey(e.key);
      }
      if (e.key === "Backspace") {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [currentGuess, gameState, noev, revealStep, inGame]);

  let letterInfo = new Map<string, Clue>();
  const tableRows = Array(props.maxGuesses)
    .fill(undefined)
    .map((_, i) => {
      const guess = [...guesses, currentGuess][i] ?? "";
      const cluedLetters = clue(guess, target);
      const lockedIn = i < guesses.length;
      if (lockedIn) {
        for (const { clue, letter } of cluedLetters) {
          if (clue === undefined) break;
          const old = letterInfo.get(letter);
          if (old === undefined || clue > old) {
            letterInfo.set(letter, clue);
          }
        }
      }
      return (
        <Row
          key={i}
          wordLength={wordLength}
          rowState={
            lockedIn
              ? RowState.LockedIn
              : i === guesses.length
              ? RowState.Editing
              : RowState.Pending
          }
          cluedLetters={cluedLetters}
          revealStep={revealStep}
          blind={props.blind}
        />
      );
    });

  return (
    <div className="Game" style={{ display: props.hidden ? "none" : "block" }}>
      {props.topbar && <Timer count={props.runlen} times={times} />}
      <div className="Game-main">
        <table
          className="Game-rows"
          tabIndex={0}
          aria-label="Table of guesses"
          ref={tableRef}
        >
          <tbody>{tableRows}</tbody>
        </table>
      </div>
      <p
        role="alert"
        style={{
          userSelect: /https?:/.test(hint) ? "text" : "none",
          whiteSpace: "pre-wrap",
        }}
      >
        {hint || `\u00a0`}
      </p>
      {props.nokbd || <Keyboard
        layout={props.keyboardLayout}
        letterInfo={letterInfo}
        onKey={onKey}
      />}
      <div className="Game-seed-info">
        <a target="_blank" href="https://forms.gle/FvEXU1nNBh8gtRTB7">Google Form!</a>
        {" "}
        forked from
        {" "}
        <a target="_blank" href="https://hellowordl.net">hello wordl</a>
        {" "}
        by
        {" "}
        <a target="_blank" href="https://twitter.com/chordbug">Lynn / @chordbug</a>
      </div>
      {/*<p>
        <button
          onClick={() => {
            share("Link copied to clipboard!");
          }}
        >
          Share a link to this game
        </button>{" "}
        {gameState !== GameState.Playing && (
          <button
            onClick={() => {
              const emoji = props.colorBlind
                ? ["⬛", "🟦", "🟧"]
                : ["⬛", "🟨", "🟩"];
              const score = gameState === GameState.Lost ? "X" : guesses.length;
              share(
                "Result copied to clipboard!",
                `${gameName} ${score}/${props.maxGuesses}\n` +
                  guesses
                    .map((guess) =>
                      clue(guess, target)
                        .map((c) => emoji[c.clue ?? 0])
                        .join("")
                    )
                    .join("\n")
              );
            }}
          >
            Share emoji results
          </button>
        )}
      </p>
      */}
    </div>
  );
}

export default Game;
