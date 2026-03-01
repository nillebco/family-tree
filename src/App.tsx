import { useState } from "react";
import type { GrampsData } from "./types/gramps";
import FileLoader from "./components/FileLoader";
import PersonPicker from "./components/PersonPicker";
import PedigreeChart from "./components/PedigreeChart";
import "./App.css";

type AppState =
  | { step: "load" }
  | { step: "pick"; data: GrampsData }
  | { step: "chart"; data: GrampsData; selectedHandle: string };

export default function App() {
  const [state, setState] = useState<AppState>({ step: "load" });

  return (
    <div className="app">
      <a
        className="github-banner"
        href="https://github.com/nillebco/family-tree"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>
          <svg className="github-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Fork this on GitHub
        </span>
      </a>
      {state.step === "load" && (
        <div className="centered">
          <h1>Pedigree Viewer</h1>
          <FileLoader
            onDataLoaded={(data) => setState({ step: "pick", data })}
          />
        </div>
      )}
      {state.step === "pick" && (
        <div className="centered">
          <h1>Select a person</h1>
          <PersonPicker
            data={state.data}
            onSelect={(handle) =>
              setState({
                step: "chart",
                data: state.data,
                selectedHandle: handle,
              })
            }
          />
        </div>
      )}
      {state.step === "chart" && (
        <PedigreeChart
          data={state.data}
          selectedHandle={state.selectedHandle}
          onBack={() => setState({ step: "pick", data: state.data })}
          onDataChanged={(newData) =>
            setState({ step: "chart", data: newData, selectedHandle: state.selectedHandle })
          }
        />
      )}
    </div>
  );
}
