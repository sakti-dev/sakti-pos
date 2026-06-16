/* @refresh reload */
import { render } from "solid-js/web";
import "./styles/index.css";
import AppRoutes from "./routes.tsx";

const root = document.getElementById("root");

render(() => <AppRoutes />, root!);
