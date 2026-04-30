/* @refresh reload */
import "@saurl/tauri-plugin-safe-area-insets-css-api";
import { render } from "solid-js/web";
import App from "./App";
import { initSafeArea } from "./lib/safe-area";

initSafeArea();
render(() => <App />, document.getElementById("root") as HTMLElement);
