import { useCallback } from "react";
import type { GrampsData } from "../types/gramps";
import { parseGrampsNdjson } from "../utils/grampsParser";

interface FileLoaderProps {
  onDataLoaded: (data: GrampsData) => void;
}

export default function FileLoader({ onDataLoaded }: FileLoaderProps) {
  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const data = parseGrampsNdjson(text);
        onDataLoaded(data);
      };
      reader.readAsText(file);
    },
    [onDataLoaded]
  );

  return (
    <div className="file-loader">
      <label>
        Load Gramps Web NDJSON export:
        <input type="file" accept=".json,.ndjson" onChange={handleFile} />
      </label>
    </div>
  );
}
