import { render } from "preact";
import { App } from "./ui/App";
import "./styles.css";

// Inside Anna the mobile shell injects the viewport meta (the app must not ship its own).
// The local mock preview runs in a plain browser tab, so add one there only.
if (import.meta.env.MODE === "mock" && !document.querySelector('meta[name="viewport"]')) {
  const m = document.createElement("meta");
  m.name = "viewport";
  m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
  document.head.appendChild(m);
}

render(<App />, document.getElementById("root")!);
