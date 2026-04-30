/* @refresh reload */
import "@saurl/tauri-plugin-safe-area-insets-css-api";
import { render } from "solid-js/web";
import Database from "@tauri-apps/plugin-sql";
import { initSafeArea } from "./lib/safe-area";
import { seedDefaultOwner } from "./lib/auth-provider";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");

async function bootstrap() {
  initSafeArea();
  try {
    await Database.load("sqlite:sakti-pos.db");
    await seedDefaultOwner();
    render(() => <App />, root!);
  } catch (err) {
    console.error("[sakti-pos] Bootstrap FAILED:", err);
    alert("Bootstrap failed: " + String(err));
  }
}

bootstrap();
