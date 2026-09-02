/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root 不存在");
render(() => <App />, root);
