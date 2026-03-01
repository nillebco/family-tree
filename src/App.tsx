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
