import { useEffect, useRef, useState } from "react";
import { Row, RowState } from "./Row";
import dictionary from "./dictionary.json";
import { Clue, clue, CluedLetter, describeClue, xorclue } from "./clue";
import { Keyboard } from "./Keyboard";
import targetList from "./targets.json";
import {
  gameName,
  pick,
  speak,
  practice,
  dayNum,
  todayDayNum,
  cheat,
  maxGuesses,
  makeRandom,
  allowPractice,
  todayDate
} from "./util";

import { Day } from "./Stats"

export enum GameState {
  Playing,
  Won,
  Lost,
}

export const gameDayStoragePrefix = "result-";
export const guessesDayStoragePrefix = "guesses-";

function useLocalStorage<T>(
  key: string,
  initial: T
): [T, (value: T | ((t: T) => T)) => void] {
  const [current, setCurrent] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initial;
    } catch (e) {
      return initial;
    }
  });
  const setSetting = (value: T | ((t: T) => T)) => {
    try {
      const v = value instanceof Function ? value(current) : value;
      setCurrent(v);
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  };
  return [current, setSetting];
}

interface GameProps {
  maxGuesses: number;
  hidden: boolean;
  colorBlind: boolean;
  keyboardLayout: string;
}

const eligible = targetList.slice(0, targetList.indexOf("murky") + 1).filter((word) => word.length === 5); // Words no rarer than this one

function isValidCluePair(word1: string, word2: string) {
  if (/\*/.test(word1)) {
    return false;
  }
  if (/\*/.test(word2)) {
    return false;
  }
  if (word1.length !== word2.length) {
    return false;
  }
  if (word1 === word2) {
    return false;
  }
  for (let i = 0; i < word1.length; ++i) {
    if(word1[i] === word2[i]) {
      return false;
    }
    if (word2.lastIndexOf(word1[i]) !== -1) {
      return false;
    }
  }
  return true;
}

function countMatching(cluedLetters: CluedLetter[]) : Map<Clue, number> {
  let counts = new Map<Clue,number>();
  for (const letter of cluedLetters) {
    let clue = letter.clue;
    if (clue) {
      let count = counts.get(clue) ?? 0;
      counts.set(clue, count+1);
    }
  }
  return counts;
}

function isGoodInitialGuess(targets: [string,string], candidate: string) {
  if (/\*/.test(candidate)) {
    return false;
  }
  let hints1 = clue(candidate, targets[0]);
  let hints2 = clue(candidate, targets[1]);
  let green1 = countMatching(hints1).get(Clue.Correct) ?? 0;
  let yellow1 = countMatching(hints1).get(Clue.Elsewhere) ?? 0;
  let green2 = countMatching(hints2).get(Clue.Correct) ?? 0;
  let yellow2 = countMatching(hints2).get(Clue.Elsewhere) ?? 0;  
  return green1+yellow1 < 5 && green2+yellow2 < 5;
}

function randomTargets(random: ()=>number): [string,string] {
  let candidate1: string;
  let candidate2: string;
  do {
    candidate1 = pick(eligible, random);
    candidate2 = pick(eligible, random);
  } while (!isValidCluePair(candidate1,candidate2));
  return [candidate1, candidate2];
}

function initialGuess(targets: [string,string], random: ()=>number): [string] {
  let candidate: string;
  do {
    candidate = pick(eligible, random);
  } while(!isGoodInitialGuess(targets, candidate));
  return [candidate];
}

function randomClue(targets: string[], random: ()=>number) {
  let candidate: string;
  do {
    candidate = pick(eligible, random);
  } while (targets.includes(candidate));
  return candidate;
}

function gameOverText(state: GameState, targets: [string,string]) : string {
  const verbed = state === GameState.Won ? "won" : "lost";
  return `you ${verbed}! the answers were ${targets[0].toUpperCase()}, ${targets[1].toUpperCase()}. play again tomorrow`; 
}

let uniqueGame = 1000;
export function makePuzzle(seed: number) : Puzzle {
  let random = makeRandom(seed+uniqueGame);
  let targets =  randomTargets(random);
  let puzzle: Puzzle = {
    targets: targets,
    initialGuesses: initialGuess(targets, random)
  };
  return puzzle;
}

export function emojiBlock(day: Day, colorBlind: boolean) : string {
  const emoji = colorBlind
    ? ["⬛", "🟦", "🟧"]
    : ["⬛", "🟨", "🟩"];
  return day.guesses.map((guess) =>
        xorclue(clue(guess, day.puzzle.targets[0]),clue(guess, day.puzzle.targets[1]))
          .map((c) => emoji[c.clue ?? 0])
          .join("")
      )
      .join("\n");
}

export interface Puzzle {
  targets: [string, string],
  initialGuesses: string[]
}

function Game(props: GameProps) {

  let seed: number = dayNum;
  if (practice) {
    seed = new Date().getMilliseconds();
    if (!(new URLSearchParams(window.location.search).has("new"))) {
      try {
        let storedSeed = window.localStorage.getItem("practice");
        if (storedSeed) {
          seed = parseInt(storedSeed);
        } else {
          window.localStorage.setItem("practice",""+seed);
        }
      } catch(e) {
      }
    }
  }

  const [puzzle, setPuzzle] = useState(() => {
    return makePuzzle(seed);
  });

  let stateStorageKey = practice ? "practiceState" : (gameDayStoragePrefix+seed);
  let guessesStorageKey = practice ? "practiceGuesses" : (guessesDayStoragePrefix+seed);

  const [gameState, setGameState] = useLocalStorage<GameState>(stateStorageKey, GameState.Playing);
  const [guesses, setGuesses] = useLocalStorage<string[]>(guessesStorageKey, puzzle.initialGuesses);
  const [currentGuess, setCurrentGuess] = useState<string>("");
  const [hint, setHint] = useState<string>(getHintFromState());
   
  const tableRef = useRef<HTMLTableElement>(null);
  async function share(copiedHint: string, text?: string) {
    const url = window.location.origin + window.location.pathname;
    const body = (text ? text + "\n" : "") + url;
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
      setHint(copiedHint);
      return;
    } catch (e) {
      console.warn("navigator.clipboard.writeText failed:", e);
    }
    setHint(url);
  }

  function getHintFromState() {    
    if  (gameState === GameState.Won || gameState === GameState.Lost) {
      return gameOverText(gameState, puzzle.targets);
    }
    if (guesses.includes(puzzle.targets[0])) {
      return `You got ${puzzle.targets[0].toUpperCase()}, one more to go.`;
    }     
    if (guesses.includes(puzzle.targets[1])) {
      return `You got ${puzzle.targets[1].toUpperCase()}, one more to go.`;
    }
    if ( guesses.length === 0 && currentGuess === undefined ) {
      return `Start guessin'`;
    }
    return ``;
  }

  const onKey = (key: string) => {
    if (gameState !== GameState.Playing) {
      return;
    }

    const bonusGuess = guesses.length === maxGuesses && puzzle.targets.includes(guesses[guesses.length-1]);
    const realMaxGuesses = props.maxGuesses+(bonusGuess?1:0);
  
    if (guesses.length === realMaxGuesses) {
      return;
    }
    if (/^[a-z]$/i.test(key)) {
      setCurrentGuess((guess) =>
        (guess + key.toLowerCase()).slice(0, 5)
      );
      tableRef.current?.focus();
      setHint(getHintFromState());
    } else if (key === "Backspace") {
      setCurrentGuess((guess) => guess.slice(0, -1));
      setHint(getHintFromState());
    } else if (key === "Enter") {
    
      if (currentGuess.length !== 5) {
        setHint("Type more letters");
        return;
      }
      if(guesses.includes(currentGuess)) {
        setHint("You've already guessed that");
        return;
      }
      if (!dictionary.includes(currentGuess)) {
        setHint(`That's not in the word list`);
        return;
      }
     
      setGuesses((guesses) => guesses.concat([currentGuess]));
      setCurrentGuess("");
      speak(describeClue(xorclue(clue(currentGuess, puzzle.targets[0]), clue(currentGuess, puzzle.targets[1]))))
      doWinOrLose();
    }
  };

  const resetPractice = () => {
    if (practice) {
      window.localStorage.removeItem("practice");
      window.localStorage.removeItem("practiceState");
      window.localStorage.removeItem("practiceGuesses");
    }
  }

  const doWinOrLose = () => {
    if ( puzzle.targets.length !== 2 ) {
      return;
    }
    if ( (guesses.includes(puzzle.targets[0]) && guesses.includes(puzzle.targets[1])) ) {
      setGameState(GameState.Won);
      resetPractice();
    } else if (guesses.length >= props.maxGuesses) {
      if (puzzle.targets.includes(guesses[guesses.length-1])) {
        setHint("Last chance! Do a bonus guess.")
        return;
      }        
      setGameState(GameState.Lost);
      resetPractice();
    } 
    setHint(getHintFromState());
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
  }, [currentGuess, gameState]);

  useEffect(() => {
    doWinOrLose();
  }, [currentGuess, gameState, guesses, puzzle.targets]);

  let reduceCorrect = (prev: CluedLetter, iter: CluedLetter, currentIndex: number, array: CluedLetter[]) => {
    let reduced: CluedLetter = prev;
    if ( iter.clue !== Clue.Correct ) {
      reduced.clue = Clue.Absent;
    }
    return reduced;
  };

  const showBonusGuessRow =  
    (gameState === GameState.Playing && guesses.length === maxGuesses && puzzle.targets.includes(guesses[guesses.length-1])) ||
    (gameState !== GameState.Playing && guesses.length === (maxGuesses+1));

  const realMaxGuesses = Math.max(guesses.length,(showBonusGuessRow ? props.maxGuesses+1 : props.maxGuesses ));
  let letterInfo = new Map<string, Clue>();
  const correctGuess = 
    gameState === GameState.Won 
    ? "" 
    : guesses.includes(puzzle.targets[0]) 
    ? puzzle.targets[0]
    : guesses.includes(puzzle.targets[1])
    ? puzzle.targets[1]
    : "";

  const tableRows = Array(realMaxGuesses)
    .fill(undefined)
    .map((_, i) => {
      const guess = [...guesses, currentGuess][i] ?? "";
      const cluedLetters = xorclue(clue(guess, puzzle.targets[0]),clue(guess, puzzle.targets[1]));
      const isTarget = puzzle.targets.includes(guess);
      const isBonusGuess = i === maxGuesses;
      const lockedIn = (!isBonusGuess && i < guesses.length) || (isBonusGuess && guesses.length === realMaxGuesses);
      const isAllGreen = lockedIn && cluedLetters.reduce( reduceCorrect, {clue: Clue.Correct, letter: ""} ).clue === Clue.Correct;                
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
          rowState={
            lockedIn
              ? RowState.LockedIn
              : (i === guesses.length || isBonusGuess)
              ? RowState.Editing
              : RowState.Pending
          }
          cluedLetters={cluedLetters}
          correctGuess={correctGuess}
          annotation={isBonusGuess ? "bonus!" : ((isAllGreen && !isTarget) ? "huh?" : `\u00a0`)}          
        />
      );
    });

  const cheatText = cheat ? ` ${puzzle.targets}` : "";
  const canPrev = dayNum > 1;
  const canNext = dayNum < todayDayNum;
  const practiceLink = "?unlimited";
  const prevLink = "?x=" + (dayNum-1).toString();
  const nextLink = "?x=" + (dayNum+1).toString();

  const [readNewsDay, setReadNewsDay] = useLocalStorage<number>("read-news-", 0);
  let news = "";
  let showNews = false;
  let newsPostedDay = 13;
  const canShowNews = news !== "" && dayNum >= newsPostedDay;
  const newsHasntBeenRead = readNewsDay < newsPostedDay;
  const newsReadToday = readNewsDay == dayNum;
  if (!practice && canShowNews && (newsHasntBeenRead || newsReadToday)) {
    showNews = true;
    if (!newsReadToday) {
      setReadNewsDay(dayNum);
    }
  }

  return (
    <div className="Game" style={{ display: props.hidden ? "none" : "block" }}>

      <div className="Game-options">
        {!practice && canPrev && <span><a href={prevLink}>prev</a> |</span>}
        {!practice && <span>day {dayNum}{`${cheatText}`}</span>}
        {!practice && canNext && <span>| <a href={nextLink}>next</a></span>}

        {practice && <span>{`${cheatText}`}</span>}
        {practice && <span><a href={practiceLink} onClick={ ()=>{resetPractice();} }>+ New Puzzle</a></span>}
      </div>
      {showNews && (<div className="News">{news}
      </div>) }
      <table
        className="Game-rows"
        tabIndex={0}
        aria-label="table of guesses"
        ref={tableRef}
      >
        <tbody>{tableRows}</tbody>
      </table>
      <p
        role="alert"
        style={{
          userSelect: /https?:/.test(hint) ? "text" : "none",
          whiteSpace: "pre-wrap",
        }}
      >
        {hint || `\u00a0`}
        {gameState !== GameState.Playing && !practice && (
          <p>
          <button
            onClick={() => {
              const score = gameState === GameState.Lost ? "X" : guesses.length;
              share(
                "Result copied to clipboard!",
                `${gameName} #${dayNum} ${score}/${props.maxGuesses}\n` +
                emojiBlock({guesses:guesses, puzzle:puzzle, gameState:gameState}, props.colorBlind)
              );
            }}
          >
            share emoji results
          </button>
          </p>
        )}
      </p>
      <Keyboard
        layout={props.keyboardLayout}
        letterInfo={letterInfo}
        correctGuess={correctGuess}
        onKey={onKey}
      />
    </div>
  );
}

export default Game;
