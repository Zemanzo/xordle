import { Clue, clueClass } from "./clue";

interface KeyboardProps {
  layout: string;
  letterInfo: Map<string, Clue>;
  correctGuess: string;
  onKey: (key: string) => void;
}

export function Keyboard(props: KeyboardProps) {
  const keyboard = props.layout
    .split("-")
    .map((row) =>
      row
        .split("")
        .map((key) => key.replace("B", "Backspace").replace("E", "Enter"))
    );

  let numAbsent = 0;
  let numElsewhere = 0;
  let numCorrect = 0;
  props.letterInfo.forEach((value: Clue, key: string) => {
    if (props.correctGuess.lastIndexOf(key) === -1) {
      if (value === Clue.Absent) {
        numAbsent++;
      }
      if (value === Clue.Elsewhere) {
        numElsewhere++;
      }
      if (value === Clue.Correct) {
        numCorrect++;
      }
    }
  });

  return (
    <div className="Game-keyboard" aria-hidden="true">
      {keyboard.map((row, i) => (
        <div key={i} className="Game-keyboard-row">
          {row.map((label, j) => {
            let className = "Game-keyboard-button";
            const clue = props.letterInfo.get(label);
            if (clue !== undefined) {
              className += " " + clueClass(clue, props.correctGuess.lastIndexOf(label) !== -1);
            }
            if (label.length > 1) {
              className += " Game-keyboard-button-wide";
            }
            return (
              <button
                tabIndex={-1}
                key={j}
                className={className}
                onClick={() => {
                  props.onKey(label);
                }}
              >
                {label.replace("Backspace", "⌫")}
              </button>
            );
          })}
        </div>
      ))}
      <div className="Game-keyboard-row">
        <div className="Game-keyboard-button letter-correct">{numCorrect}</div>
        <div className="Game-keyboard-button letter-elsewhere">{numElsewhere}</div>
        <div className="Game-keyboard-button letter-absent">{numAbsent}</div>
      </div>
    </div>
  );
}
